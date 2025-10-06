const REST = "https://api.binance.com";
const WS   = "wss://stream.binance.com:9443/ws";
const SYM  = "GBPUSDT";

let chart, candleSeries;
let boxTop, boxBottom, boxReady=false;

initChart();
fetchKlines().then(()=>subscribeTrade());

document.getElementById("refresh").onclick = ()=>fetchKlines();
document.getElementById("timeframe").onchange = ()=>fetchKlines();

function initChart(){
  const container = document.getElementById("chart");
  chart = LightweightCharts.createChart(container,{
    width: container.clientWidth,
    height: container.clientHeight,
    layout:{background:{color:"#1e1e1e"},textColor:"#ccc"},
    grid:{vertLines:{color:"#2a2a2a"},horzLines:{color:"#2a2a2a"}},
    crosshair:{mode: LightweightCharts.CrosshairMode.Normal},
    rightPriceScale:{borderColor:"#444"},
    timeScale:{borderColor:"#444",timeVisible:true,secondsVisible:false},
  });
  candleSeries = chart.addCandlestickSeries({
    upColor:"#26a69a",downColor:"#ef5350",borderVisible:false,
    wickUpColor:"#26a69a",wickDownColor:"#ef5350"
  });
  window.addEventListener("resize",()=>{
    chart.applyOptions({width:container.clientWidth,height:container.clientHeight});
  });
}

async function fetchKlines(){
  const interval = document.getElementById("timeframe").value;
  const url = `${REST}/api/v3/klines?symbol=${SYM}&interval=${interval}&limit=500`;
  const raw = await fetch(url).then(r=>r.json());
  const bars = raw.map(k=>({
    time: k[0]/1000,
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low:  parseFloat(k[3]),
    close:parseFloat(k[4])
  }));
  candleSeries.setData(bars);
  buildBox(bars);
}

function subscribeTrade(){
  const s = new WebSocket(WS);
  s.onopen = ()=> s.send(JSON.stringify({method:"SUBSCRIBE",params:[`${SYM.toLowerCase()}@trade`],id:1}));
  s.onmessage = (msg)=>{
    const {p:price} = JSON.parse(msg.data);
    document.getElementById("lastPrice") && (document.getElementById("lastPrice").textContent = parseFloat(price).toFixed(5));
  };
}

function buildBox(bars){
  const now = new Date();
  const offset = now.getTimezoneOffset()*60*1000;
  const gmt = now.getTime() + offset;
  const today7 = new Date(gmt);
  today7.setUTCHours(7,0,0,0);
  const today0 = new Date(today7);
  today0.setUTCDate(today7.getUTCDate()-1);
  today0.setUTCHours(24,0,0,0);

  const asian = bars.filter(b=>{
    const t = b.time*1000;
    return t>=today0.getTime() && t<=today7.getTime();
  });
  if(!asian.length){boxReady=false;return;}

  boxTop    = Math.max(...asian.map(b=>b.high));
  boxBottom = Math.min(...asian.map(b=>b.low));
  boxReady  = true;

  if(window.boxRect)chart.removeSeries(window.boxRect);
  window.boxRect = chart.addHistogramSeries({
    color:"rgba(255,255,255,0.06)",visible:true,priceFormat:{type:"price",precision:5}
  });
  const boxData = asian.map(b=>({time:b.time,color:"rgba(255,255,255,0.05)"}));
  window.boxRect.setData(boxData);

  document.getElementById("status").textContent="Box ready – waiting for close";
  scanLastBar(bars[bars.length-1]);
}

function scanLastBar(bar){
  if(!boxReady)return;
  const risk   = (boxTop - boxBottom) + 0.0002;
  const entryL = boxTop  + 0.0001;
  const entryS = boxBottom - 0.0001;
  const longOK = bar.close>entryL && bar.open<=entryL;
  const shortOK= bar.close<entryS && bar.open>=entryS;

  if(longOK)     setTrade("LONG", entryL, boxBottom-0.0001, entryL + risk*1.5);
  else if(shortOK)setTrade("SHORT",entryS, boxTop+0.0001,    entryS - risk*1.5);
}

function setTrade(dir,entry,sl,tp){
  document.getElementById("status").textContent = dir+"  TRIGGERED";
  document.getElementById("entry").textContent  = entry.toFixed(5);
  document.getElementById("stop").textContent   = sl.toFixed(5);
  document.getElementById("tp").textContent     = tp.toFixed(5);
}
