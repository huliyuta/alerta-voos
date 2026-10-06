const ALARME_VERIFICAR = 'verificar';
const ALARME_LIMPAR = 'limpar-abas';
const INTERVALO_PADRAO_MIN = 360; // 6h
const MAX_HISTORICO = 200;

// Aeroportos da mesma cidade contam como "voo parecido"
const CIDADES = {
  GRU: 'SAO', CGH: 'SAO', VCP: 'SAO',
  GIG: 'RIO', SDU: 'RIO',
  CNF: 'BHZ', PLU: 'BHZ',
  CDG: 'PAR', ORY: 'PAR', BVA: 'PAR',
  LHR: 'LON', LGW: 'LON', STN: 'LON', LTN: 'LON', LCY: 'LON', SEN: 'LON',
  JFK: 'NYC', EWR: 'NYC', LGA: 'NYC',
  MXP: 'MIL', LIN: 'MIL', BGY: 'MIL',
  FCO: 'ROM', CIA: 'ROM',
  NRT: 'TYO', HND: 'TYO',
  ORD: 'CHI', MDW: 'CHI',
  IAD: 'WAS', DCA: 'WAS', BWI: 'WAS',
  EZE: 'BUE', AEP: 'BUE',
  MIA: 'MIA', FLL: 'MIA',
  IST: 'IST', SAW: 'IST',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatar(valor, moeda) {
  const simbolo = moeda && moeda !== 'BRL' ? moeda : 'R$';
  return `${simbolo} ${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

function dataCurta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function descrever(o) {
  const datas = o.volta ? `${dataCurta(o.ida)}–${dataCurta(o.volta)}` : dataCurta(o.ida);
  return `${o.origem}→${o.destino} ${datas} (${o.companhia})`;
}

const diasEntre = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

// ---------- Ofertas vindas das páginas ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.tipo === 'ofertas') {
    processarOfertas(msg, sender).then(sendResponse);
    return true;
  }
  if (msg.tipo === 'reagendar') {
    agendar().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.tipo === 'verificar-agora') {
    verificarBuscasSalvas().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function processarOfertas({ ofertas, url }, sender) {
  const { alertas = [], toleranciaDias = 3, mesmaCidade = true } =
    await chrome.storage.local.get(['alertas', 'toleranciaDias', 'mesmaCidade']);
  const cidade = (c) => (mesmaCidade ? CIDADES[c] || c : c);
  const agora = Date.now();
  const avisos = [];

  for (const a of alertas) {
    a.avisados ||= {};

    // 1) O próprio voo baixou?
    const exatas = ofertas.filter((o) => o.chave === a.chave);
    if (exatas.length) {
      const preco = Math.min(...exatas.map((o) => o.preco));
      const ultimo = a.historico?.at(-1);
      if (!ultimo || ultimo.preco !== preco) {
        a.historico = [...(a.historico || []), { preco, data: agora }].slice(-MAX_HISTORICO);
      }
      a.ultimoPreco = preco;
      a.ultimaVerificacao = agora;
      if (preco < a.menorPreco) {
        avisos.push({
          chave: a.chave,
          titulo: descrever(a),
          texto: `baixou de ${formatar(a.menorPreco, a.moeda)} para ${formatar(preco, a.moeda)}`,
        });
        a.menorPreco = preco;
      }
    }

    // 2) Tem um parecido (mesma cidade, datas próximas) mais barato?
    const parecidas = ofertas.filter((o) =>
      o.chave !== a.chave &&
      cidade(o.origem) === cidade(a.origem) &&
      cidade(o.destino) === cidade(a.destino) &&
      diasEntre(o.ida, a.ida) <= toleranciaDias &&
      (a.volta ? o.volta && diasEntre(o.volta, a.volta) <= toleranciaDias : !o.volta) &&
      o.preco < a.menorPreco);
    if (!parecidas.length) continue;

    const melhor = parecidas.reduce((x, y) => (y.preco < x.preco ? y : x));
    if (!a.melhorParecido || melhor.preco <= a.melhorParecido.preco || melhor.chave === a.melhorParecido.chave) {
      a.melhorParecido = { ...melhor, url, visto: agora };
    }
    // Não repete o aviso para a mesma oferta no mesmo preço
    if (a.avisados[melhor.chave] != null && a.avisados[melhor.chave] <= melhor.preco) continue;
    a.avisados[melhor.chave] = melhor.preco;
    avisos.push({
      chave: melhor.chave,
      titulo: `Parecido com ${descrever(a)}`,
      texto: `${descrever(melhor)} por ${formatar(melhor.preco, melhor.moeda)} ` +
        `(${formatar(a.menorPreco - melhor.preco, melhor.moeda)} mais barato)`,
    });
  }

  await chrome.storage.local.set({ alertas });

  for (const aviso of avisos) notificar(aviso, url);
  if (sender.tab?.id != null) {
    if (avisos.length) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: '↓' });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#ef4444' });
    }
    await fecharSeForAbaAutomatica(sender.tab.id);
  }

  return { avisos };
}

function notificar(aviso, url) {
  const id = `aviso|${crypto.randomUUID()}`;
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `✈️ ${aviso.titulo}`,
    message: aviso.texto,
    priority: 2,
  });
  chrome.storage.session.set({ [id]: url });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { [id]: url } = await chrome.storage.session.get(id);
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(id);
  chrome.storage.session.remove(id);
});

// ---------- Verificação automática ----------
// Abre a página onde cada alerta foi criado numa aba em segundo plano; o
// content script lê os preços e a aba é fechada assim que o resultado chega.

async function agendar() {
  const { intervaloMin = INTERVALO_PADRAO_MIN } = await chrome.storage.local.get('intervaloMin');
  await chrome.alarms.clear(ALARME_VERIFICAR);
  if (intervaloMin > 0) {
    chrome.alarms.create(ALARME_VERIFICAR, { periodInMinutes: intervaloMin, delayInMinutes: intervaloMin });
  }
}

chrome.runtime.onInstalled.addListener(agendar);
chrome.runtime.onStartup.addListener(agendar);

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_VERIFICAR) verificarBuscasSalvas();
  if (alarme.name === ALARME_LIMPAR) fecharAbasAutomaticas();
});

async function verificarBuscasSalvas() {
  const { alertas = [] } = await chrome.storage.local.get('alertas');
  const urls = [...new Set(alertas.map((a) => a.url).filter(Boolean))];
  if (!urls.length) return;

  const { abasAuto = [] } = await chrome.storage.session.get('abasAuto');
  for (const url of urls) {
    const aba = await chrome.tabs.create({ url, active: false });
    abasAuto.push(aba.id);
  }
  await chrome.storage.session.set({ abasAuto });
  // Fecha o que sobrar caso a página não carregue
  chrome.alarms.create(ALARME_LIMPAR, { delayInMinutes: 2 });
}

async function fecharSeForAbaAutomatica(tabId) {
  const { abasAuto = [] } = await chrome.storage.session.get('abasAuto');
  if (!abasAuto.includes(tabId)) return;
  await chrome.storage.session.set({ abasAuto: abasAuto.filter((id) => id !== tabId) });
  chrome.tabs.remove(tabId).catch(() => {});
}

async function fecharAbasAutomaticas() {
  const { abasAuto = [] } = await chrome.storage.session.get('abasAuto');
  await chrome.storage.session.set({ abasAuto: [] });
  for (const id of abasAuto) chrome.tabs.remove(id).catch(() => {});
}
