# Alerta de Voos

Extensão para Chrome/Edge que coloca um botão **🔔 Avise-me** nos voos dos sites de passagem
e avisa quando:

1. **o mesmo voo baixar de preço**, ou
2. **aparecer um voo parecido mais barato** — mesma cidade de origem e destino (ex.: CDG ou
   ORY para Paris), datas próximas (±3 dias por padrão) e qualquer companhia.

## Instalar

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha esta pasta (`alerta-voos`).

## Usar

1. Faça uma busca na Decolar (ou LATAM, GOL, Azul...).
2. Clique em **🔔 Avise-me** no card do voo. O botão vira **✓ Avisando** e o card ganha
   um contorno tracejado. Clique de novo para parar de monitorar.
3. Sempre que você abrir uma busca com esse voo (ou parecidos), a extensão compara os preços.
   Se achar algo melhor, mostra um aviso no canto da página, contorna o card em vermelho e
   manda uma notificação do Windows.
4. Ela também reabre sozinha a página onde você salvou o alerta, numa aba em segundo plano
   (padrão: a cada 6h), lê os preços e fecha a aba. O navegador precisa estar aberto.

No ícone da extensão você vê os alertas (preço salvo, atual, menor e o parecido mais barato) e
ajusta a tolerância de datas, se aceita outro aeroporto da mesma cidade e o intervalo.

## Como funciona

A leitura é pelo texto da página, não depende do layout de um site específico: um "card" é o
menor bloco que tem uma rota (`GRU - CDG`), datas (`5 nov. 2026` ou `05/11/2026`) e um
preço (`R$ 4.467`). A companhia vem do nome/logo do card. Parcelas ("10x de R$ ...") são
ignoradas.

Testado nos cards "Voos mais baratos" da Decolar. Em outros sites funciona se a página mostrar
códigos de aeroporto, datas e preço no mesmo bloco; se não mostrar, o botão não aparece.

## Limitações

- Os preços da Decolar nesses cards são "a partir de" — o valor final pode mudar na reserva.
- Alguns sites bloqueiam abas automáticas (captcha/antibot); aí a verificação automática não
  lê nada, mas a leitura enquanto você navega continua valendo.
