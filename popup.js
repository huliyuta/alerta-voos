const lista = document.getElementById('lista');
const vazio = document.getElementById('vazio');
const tolerancia = document.getElementById('tolerancia');
const mesmaCidade = document.getElementById('mesmaCidade');
const intervalo = document.getElementById('intervalo');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatar(valor, moeda) {
  if (valor == null) return '—';
  const simbolo = moeda && moeda !== 'BRL' ? moeda : 'R$';
  return `${simbolo} ${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

function dataCurta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

const datas = (o) => (o.volta ? `${dataCurta(o.ida)} → ${dataCurta(o.volta)}` : `${dataCurta(o.ida)} (só ida)`);

function quando(ts) {
  return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

async function render() {
  const { alertas = [], toleranciaDias = 3, mesmaCidade: cidade = true, intervaloMin = 360 } =
    await chrome.storage.local.get(['alertas', 'toleranciaDias', 'mesmaCidade', 'intervaloMin']);
  tolerancia.value = String(toleranciaDias);
  mesmaCidade.checked = cidade;
  intervalo.value = String(intervaloMin);

  vazio.hidden = alertas.length > 0;
  lista.replaceChildren();

  for (const a of alertas) {
    const li = el('li', a.menorPreco < a.precoSalvo ? 'caiu' : '');
    li.append(
      el('div', 'titulo', `${a.origem} → ${a.destino} · ${a.companhia}`),
      el('div', '', `${datas(a)}`),
      el('div', '', `Salvo: ${formatar(a.precoSalvo, a.moeda)} · Atual: ${formatar(a.ultimoPreco, a.moeda)} · Menor: ${formatar(a.menorPreco, a.moeda)}`),
      el('div', 'meta', `Última leitura: ${quando(a.ultimaVerificacao)}`),
    );

    const p = a.melhorParecido;
    if (p && p.preco < a.menorPreco) {
      const link = el('a', 'parecido',
        `Parecido mais barato: ${formatar(p.preco, p.moeda)} — ${p.companhia}, ${p.origem}→${p.destino}, ${datas(p)}`);
      link.href = p.url;
      link.target = '_blank';
      li.appendChild(link);
    }

    const remover = el('button', 'remover', '×');
    remover.title = 'Parar de monitorar';
    remover.onclick = async () => {
      const atual = (await chrome.storage.local.get('alertas')).alertas || [];
      await chrome.storage.local.set({ alertas: atual.filter((x) => x.id !== a.id) });
    };
    li.appendChild(remover);

    li.ondblclick = () => a.url && chrome.tabs.create({ url: a.url });
    li.title = 'Clique duas vezes para abrir a busca';
    lista.appendChild(li);
  }
}

tolerancia.onchange = () => chrome.storage.local.set({ toleranciaDias: Number(tolerancia.value) });
mesmaCidade.onchange = () => chrome.storage.local.set({ mesmaCidade: mesmaCidade.checked });
intervalo.onchange = async () => {
  await chrome.storage.local.set({ intervaloMin: Number(intervalo.value) });
  chrome.runtime.sendMessage({ tipo: 'reagendar' });
};
document.getElementById('verificarAgora').onclick = () => {
  chrome.runtime.sendMessage({ tipo: 'verificar-agora' });
  window.close();
};

chrome.storage.onChanged.addListener((m) => { if (m.alertas) render(); });
render();
