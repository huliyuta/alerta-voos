// Lê os cards de voo da página (companhia, rota, datas, preço), coloca um
// botão "Avise-me" em cada um e manda as ofertas para o background comparar
// com os alertas salvos.

const ROTA_RE = /\b([A-Z]{3})\s?[-–→]\s?([A-Z]{3})\b/g;
const PRECO_RE = /(R\$|US\$|U\$|€|£|\$|BRL|USD|EUR)\s?(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;
const PARCELA_RE = /\d+\s?x\s?(de\s?)?$/i; // "10x de R$ 123" não é o preço total
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const DATA_RE = /(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s+(?:de\s+)?(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/gi;
const IGNORAR_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
const MAX_SUBIDA = 10;
const MAX_TEXTO_CARD = 1500;

let ultimoEnvio = '';

// ---------- Leitura do texto ----------

function parsePreco(bruto) {
  let s = bruto.replace(/\s/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function precosNoTexto(texto) {
  const precos = [];
  for (const m of texto.matchAll(PRECO_RE)) {
    const antes = texto.slice(Math.max(0, m.index - 8), m.index);
    if (PARCELA_RE.test(antes.trimEnd())) continue;
    const valor = parsePreco(m[2]);
    if (valor) precos.push({ valor, moeda: m[1] });
  }
  return precos;
}

function datasNoTexto(texto) {
  return [...texto.matchAll(DATA_RE)].map((m) => {
    const [d, mes, a] = m[1]
      ? [m[1], MESES[m[2].toLowerCase()], m[3]]
      : [m[4], m[5], m[6]];
    return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });
}

// Junta os pedaços de texto com espaço: textContent cola "IDA" + "GRU - CDG"
// em "IDAGRU - CDG" e aí a rota não é reconhecida.
function textoDe(el) {
  const partes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let no = walker.nextNode(); no; no = walker.nextNode()) {
    if (no.parentElement?.closest('.alerta-voos-botao')) continue;
    partes.push(no.nodeValue);
  }
  return partes.join(' ').replace(/ /g, ' ').replace(/\s+/g, ' ');
}

// ---------- Cards ----------

// Um card é o menor bloco em volta de uma rota "GRU - CDG" que também tem preço
function encontrarCards() {
  const cards = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let no = walker.nextNode(); no; no = walker.nextNode()) {
    const pai = no.parentElement;
    if (!pai || IGNORAR_TAGS.has(pai.tagName) || pai.closest('#alerta-voos-banner')) continue;
    ROTA_RE.lastIndex = 0;
    if (!ROTA_RE.test(no.nodeValue)) continue;

    let atual = pai;
    for (let i = 0; i < MAX_SUBIDA && atual && atual !== document.body; i++) {
      const texto = textoDe(atual);
      if (texto.length > MAX_TEXTO_CARD || (texto.match(ROTA_RE) || []).length > 2) break;
      if (precosNoTexto(texto).length) {
        cards.add(atual);
        break;
      }
      atual = atual.parentElement;
    }
  }
  return [...cards];
}

function lerCompanhia(card) {
  const nome = card.querySelector('[class*="airline-name"]')?.textContent.trim();
  if (nome) return nome;
  const logos = [...card.querySelectorAll('img[alt]')].map((i) => i.alt.trim()).filter(Boolean);
  return logos.join(' + ') || 'Companhia';
}

function lerCard(card) {
  const texto = textoDe(card);
  const rotas = [...texto.matchAll(ROTA_RE)];
  const datas = datasNoTexto(texto);
  const precos = precosNoTexto(texto);
  if (!rotas.length || !datas.length || !precos.length) return null;

  const menor = precos.reduce((a, b) => (b.valor < a.valor ? b : a));
  const oferta = {
    companhia: lerCompanhia(card),
    origem: rotas[0][1],
    destino: rotas[0][2],
    ida: datas[0],
    volta: rotas.length > 1 ? datas[1] || null : null,
    preco: menor.valor,
    moeda: menor.moeda,
  };
  oferta.chave = [oferta.companhia, oferta.origem, oferta.destino, oferta.ida, oferta.volta || '']
    .join('|').toLowerCase();
  return oferta;
}

// ---------- Botão "Avise-me" ----------

function atualizarBotao(card, oferta, alertas) {
  const monitorado = alertas.some((a) => a.chave === oferta.chave);
  card.classList.toggle('alerta-voos-monitorado', monitorado);

  let botao = card.querySelector(':scope > .alerta-voos-botao');
  if (!botao) {
    botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'alerta-voos-botao';
    card.appendChild(botao);
  }
  const texto = monitorado ? '✓ Avisando' : '🔔 Avise-me';
  if (botao.textContent !== texto) botao.textContent = texto;
  botao.title = monitorado
    ? 'Clique para parar de monitorar este voo'
    : 'Avisar se este voo baixar ou aparecer um parecido mais barato';

  botao.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { alertas: atuais = [] } = await chrome.storage.local.get('alertas');
    if (atuais.some((a) => a.chave === oferta.chave)) {
      await chrome.storage.local.set({ alertas: atuais.filter((a) => a.chave !== oferta.chave) });
      return;
    }
    const agora = Date.now();
    atuais.push({
      ...oferta,
      id: crypto.randomUUID(),
      precoSalvo: oferta.preco,
      menorPreco: oferta.preco,
      ultimoPreco: oferta.preco,
      ultimaVerificacao: agora,
      criadoEm: agora,
      url: location.href,
      historico: [{ preco: oferta.preco, data: agora }],
      avisados: {},
    });
    await chrome.storage.local.set({ alertas: atuais });
  };
}

// ---------- Aviso na página ----------

function mostrarBanner(avisos) {
  let banner = document.getElementById('alerta-voos-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'alerta-voos-banner';
    document.body.appendChild(banner);
  }
  banner.replaceChildren();

  const titulo = document.createElement('strong');
  titulo.textContent = '✈️ Preço mais baixo encontrado!';
  banner.appendChild(titulo);

  for (const a of avisos) {
    const linha = document.createElement('div');
    linha.textContent = `${a.titulo}: ${a.texto}`;
    banner.appendChild(linha);
  }

  const fechar = document.createElement('button');
  fechar.textContent = '×';
  fechar.title = 'Fechar';
  fechar.onclick = () => banner.remove();
  banner.appendChild(fechar);
}

// ---------- Ciclo principal ----------

async function escanear() {
  if (!document.body) return;
  const { alertas = [] } = await chrome.storage.local.get('alertas');

  const ofertas = [];
  const cardPorChave = new Map();
  for (const card of encontrarCards()) {
    const oferta = lerCard(card);
    if (!oferta) continue;
    atualizarBotao(card, oferta, alertas);
    ofertas.push(oferta);
    cardPorChave.set(oferta.chave, card);
  }

  if (!ofertas.length || !alertas.length) return;
  const assinatura = JSON.stringify(ofertas.map((o) => [o.chave, o.preco]));
  if (assinatura === ultimoEnvio) return;
  ultimoEnvio = assinatura;

  const resposta = await chrome.runtime.sendMessage({ tipo: 'ofertas', ofertas, url: location.href });
  if (!resposta?.avisos?.length) return;
  mostrarBanner(resposta.avisos);
  for (const a of resposta.avisos) cardPorChave.get(a.chave)?.classList.add('alerta-voos-destaque');
}

// Sites de passagem carregam os resultados aos poucos, então reescaneia
// (com debounce) sempre que a página muda.
let timer = null;
function agendarEscaneamento() {
  clearTimeout(timer);
  timer = setTimeout(() => escanear().catch(() => {}), 1200);
}

new MutationObserver((mutacoes) => {
  const soNossas = mutacoes.every((m) => {
    const alvo = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (alvo?.closest?.('#alerta-voos-banner, .alerta-voos-botao')) return true;
    return m.type === 'childList' && !m.removedNodes.length && m.addedNodes.length > 0 &&
      [...m.addedNodes].every((n) => n.classList?.contains('alerta-voos-botao') || n.id === 'alerta-voos-banner');
  });
  if (!soNossas) agendarEscaneamento();
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

chrome.storage.onChanged.addListener((mudancas) => {
  if (mudancas.alertas) {
    ultimoEnvio = '';
    agendarEscaneamento();
  }
});

agendarEscaneamento();
