const STORAGE_KEY="valorant-scrim-tool-v13";
const defaultMaps=["어센트","바인드","헤이븐","스플릿","로터스","선셋","어비스","펄","프랙처","브리즈","아이스박스","코로드"];

const initialState={
  lines:Array.from({length:5},(_,i)=>({
    lineNo:i+1,
    players:[{id:crypto.randomUUID(),nickname:""},{id:crypto.randomUUID(),nickname:""}],
    relation:"EQUAL"
  })),
  draft:{
    started:false,
    mode:"PAIR",
    currentPickTeam:"A",
    picks:[],
    teamA:[],
    teamB:[]
  },
  maps:defaultMaps.map(name=>({name,enabled:true})),
  mapMode:"MANUAL",
  selectedMap:"",
  attackTeam:"A",
  activeGame:"roulette",
  rouletteDeg:0,
  coinDeg:0,
  theme:"valorant"
};

let state=loadState();
let mapSpinTimer=null;

function $(id){return document.getElementById(id)}
function loadState(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(!saved)return structuredClone(initialState);
    const parsed=JSON.parse(saved);
    if(!parsed.lines?.[0]?.players)return structuredClone(initialState);
    return {...structuredClone(initialState),...parsed,draft:{...structuredClone(initialState).draft,...parsed.draft}};
  }catch{return structuredClone(initialState)}
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderAll()}
function getAllPlayers(){return state.lines.flatMap(line=>line.players)}
function getPlayer(id){return getAllPlayers().find(p=>p.id===id)}
function filledPlayers(){return getAllPlayers().filter(p=>p.nickname.trim())}
function relationToSign(relation){if(relation==="LEFT_HIGH")return ">";if(relation==="RIGHT_HIGH")return "<";return "="}
function signToRelation(sign){if(sign===">")return"LEFT_HIGH";if(sign==="<")return"RIGHT_HIGH";return"EQUAL"}
function rankLabel(line,playerId){
  if(line.relation==="EQUAL")return null;
  const idx=line.players.findIndex(p=>p.id===playerId);
  const isHigh=(line.relation==="LEFT_HIGH"&&idx===0)||(line.relation==="RIGHT_HIGH"&&idx===1);
  return isHigh?{text:"윗밸",cls:"rank-high"}:{text:"아랫밸",cls:"rank-low"};
}
function getLineOnePlayer(slotIdx){return state.lines?.[0]?.players?.[slotIdx]?.nickname?.trim()||""}
function getTeamName(team){
  const lineOneIds=state.lines[0].players.map(p=>p.id);
  const teamIds=team==="A"?state.draft.teamA:state.draft.teamB;
  const leaderId=teamIds.find(id=>lineOneIds.includes(id));
  const leader=getPlayer(leaderId);
  if(leader?.nickname?.trim())return `${leader.nickname.trim()}팀`;
  const fallbackName=team==="A"?getLineOnePlayer(0):getLineOnePlayer(1);
  if(fallbackName)return `${fallbackName}팀`;
  return `Team ${team}`;
}
function isPicked(id){return state.draft.teamA.includes(id)||state.draft.teamB.includes(id)}
function pickedTeam(id){
  if(state.draft.teamA.includes(id))return "A";
  if(state.draft.teamB.includes(id))return "B";
  return "";
}
function isLineDone(line){
  const ids=line.players.map(p=>p.id);
  if(state.draft.mode==="PAIR")return ids.some(id=>isPicked(id));
  return ids.every(id=>isPicked(id));
}
function filledTeamSize(team){return team==="A"?state.draft.teamA.length:state.draft.teamB.length}
function otherTeam(team){return team==="A"?"B":"A"}
function nextPickTeam(){
  const a=state.draft.teamA.length;
  const b=state.draft.teamB.length;
  if(a<=b)return "A";
  return "B";
}

function renderTheme(){
  document.body.dataset.theme=state.theme||"valorant";
  document.querySelectorAll(".theme-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.theme===state.theme));
}
function setTheme(theme){state.theme=theme;saveState()}
function renderPlayers(){$("playerCountBadge").textContent=`${filledPlayers().length} / 10`}

function renderLines(){
  $("lines").innerHTML=state.lines.map((line,lineIdx)=>`
    <div class="line-card">
      <div class="line-title"><span>${line.lineNo}라인</span><span>${line.players.filter(p=>p.nickname.trim()).length}/2</span></div>
      <input type="text" value="${escapeHtml(line.players[0].nickname)}" placeholder="${line.lineNo}라인 왼쪽" maxlength="20" oninput="setLineNickname(${lineIdx},0,this.value)" />
      <div class="balance-sign"><select class="balance-select" onchange="setLineSign(${lineIdx},this.value)">
        <option value="=" ${line.relation==="EQUAL"?"selected":""}>=</option>
        <option value=">" ${line.relation==="LEFT_HIGH"?"selected":""}>&gt;</option>
        <option value="<" ${line.relation==="RIGHT_HIGH"?"selected":""}>&lt;</option>
      </select></div>
      <input type="text" value="${escapeHtml(line.players[1].nickname)}" placeholder="${line.lineNo}라인 오른쪽" maxlength="20" oninput="setLineNickname(${lineIdx},1,this.value)" />
    </div>
  `).join("");
}
function setLineNickname(lineIdx,slotIdx,nickname){
  state.lines[lineIdx].players[slotIdx].nickname=nickname;
  resetDraft(false);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  renderPlayers();renderDraft();renderResultText();
}
function setLineSign(lineIdx,sign){state.lines[lineIdx].relation=signToRelation(sign);saveState()}

function validateLines(){
  const names=getAllPlayers().map(p=>p.nickname.trim());
  if(names.some(name=>!name))return"모든 라인에 닉네임을 2명씩 입력하세요.";
  const duplicated=names.find((name,idx)=>names.indexOf(name)!==idx);
  if(duplicated)return`중복 닉네임이 있습니다: ${duplicated}`;
  return"";
}
function setDraftMode(mode){
  state.draft.mode=mode;
  resetDraft(false);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  renderDraft();renderResultText();
}
function startDraft(){
  const error=validateLines();
  if(error)return alert(error);
  resetDraft(false);
  state.draft.started=true;
  if(state.draft.mode==="RANDOM"){
    randomAssignTeams();
    state.draft.started=false;
  }
  saveState();
}
function resetDraft(shouldRender=true){
  const mode=state.draft.mode||"PAIR";
  state.draft={started:false,mode,currentPickTeam:"A",picks:[],teamA:[],teamB:[]};
  if(shouldRender)saveState();
}
function randomAssignTeams(){
  state.draft.teamA=[];
  state.draft.teamB=[];
  state.draft.picks=[];
  state.lines.forEach(line=>{
    const shuffled=[...line.players].sort(()=>Math.random()-0.5);
    const aFirst=Math.random()<0.5;
    const aPlayer=aFirst?shuffled[0]:shuffled[1];
    const bPlayer=aFirst?shuffled[1]:shuffled[0];
    state.draft.teamA.push(aPlayer.id);
    state.draft.teamB.push(bPlayer.id);
    state.draft.picks.push({mode:"RANDOM",lineNo:line.lineNo,aPlayerId:aPlayer.id,bPlayerId:bPlayer.id});
  });
}

function pickPlayer(playerId){
  const draft=state.draft;
  if(!draft.started||draft.mode==="RANDOM")return;
  if(isPicked(playerId))return;
  const line=state.lines.find(l=>l.players.some(p=>p.id===playerId));
  if(!line)return;

  if(draft.mode==="PAIR"){
    const ids=line.players.map(p=>p.id);
    if(ids.some(id=>isPicked(id)))return;
    const pickTeam=draft.currentPickTeam;
    const remainTeam=otherTeam(pickTeam);
    const otherId=ids.find(id=>id!==playerId);
    if(filledTeamSize(pickTeam)>=5||filledTeamSize(remainTeam)>=5)return alert("이미 팀 인원이 가득 찼습니다.");
    draft[pickTeam==="A"?"teamA":"teamB"].push(playerId);
    draft[remainTeam==="A"?"teamA":"teamB"].push(otherId);
    draft.picks.push({mode:"PAIR",lineNo:line.lineNo,pickTeam,pickedPlayerId:playerId,autoPlayerId:otherId});
  }else{
    const pickTeam=nextPickTeam();
    if(filledTeamSize(pickTeam)>=5)return alert("이미 팀 인원이 가득 찼습니다.");
    draft[pickTeam==="A"?"teamA":"teamB"].push(playerId);
    draft.picks.push({mode:"FREE",lineNo:line.lineNo,pickTeam,pickedPlayerId:playerId});
  }

  if(draft.teamA.length===5&&draft.teamB.length===5){
    draft.started=false;
  }else{
    draft.currentPickTeam=nextPickTeam();
  }
  saveState();
}
function setAttackTeam(team){state.attackTeam=team;saveState()}

function renderDraft(){
  document.querySelectorAll("input[name='draftMode']").forEach(r=>{
    r.checked=r.value===state.draft.mode;
    r.disabled=state.draft.started||state.draft.teamA.length>0||state.draft.teamB.length>0;
  });

  const modeLabel={PAIR:"페어 드래프트",FREE:"자유 드래프트",RANDOM:"랜덤 팀 배정"}[state.draft.mode]||"페어 드래프트";
  if(!state.draft.started&&state.draft.teamA.length===0&&state.draft.teamB.length===0){
    $("draftStatus").textContent=`드래프트를 시작하세요. 현재 모드: ${modeLabel}`;
  }else if(!state.draft.started&&state.draft.teamA.length===5&&state.draft.teamB.length===5){
    $("draftStatus").textContent=`드래프트 완료 · ${modeLabel}`;
  }else if(state.draft.mode==="FREE"){
    $("draftStatus").textContent=`현재 차례: ${getTeamName(nextPickTeam())} · 자유 선택 가능`;
  }else{
    $("draftStatus").textContent=`현재 차례: ${getTeamName(state.draft.currentPickTeam)} · 원하는 라인에서 선택`;
  }

  renderDraftBoard();
  renderTeams();
}
function renderDraftBoard(){
  $("draftBoard").innerHTML=state.lines.map(line=>{
    const sign=relationToSign(line.relation);
    const done=isLineDone(line);
    return `
      <div class="draft-line ${done?"done":""}">
        <div class="draft-line-head">
          <span>${line.lineNo}라인</span>
          <span>${done?"선택 완료":"선택 가능"}</span>
        </div>
        <div class="draft-line-main">
          ${renderDraftPlayerButton(line,line.players[0])}
          <div class="draft-sign">${escapeHtml(sign)}</div>
          ${renderDraftPlayerButton(line,line.players[1])}
        </div>
      </div>
    `;
  }).join("");
}
function renderDraftPlayerButton(line,player){
  const team=pickedTeam(player.id);
  const picked=!!team;
  const rank=rankLabel(line,player.id);
  const disabled=!state.draft.started||state.draft.mode==="RANDOM"||picked||(state.draft.mode==="PAIR"&&isLineDone(line));
  let tag="";
  if(picked) tag=`${getTeamName(team)} 선택됨`;
  else if(rank) tag=rank.text;
  else tag="선택";
  return `
    <button class="draft-player-btn ${team==="A"?"picked-a":team==="B"?"picked-b":""}" onclick="pickPlayer('${player.id}')" ${disabled?"disabled":""}>
      <span>${escapeHtml(player.nickname||"-")}</span>
      <span class="pick-tag ${rank&&!picked?rank.cls:""}">${escapeHtml(tag)}</span>
    </button>
  `;
}
function renderTeams(){
  const teamHtml=(teamCode,ids)=>{
    const name=getTeamName(teamCode);
    return `
      <div class="team-box">
        <div class="team-header">
          <h3>${escapeHtml(name)} (${ids.length}/5)</h3>
          <button class="btn side-btn ${state.attackTeam===teamCode?"active":""}" onclick="setAttackTeam('${teamCode}')">${state.attackTeam===teamCode?"선공격":"선공 지정"}</button>
        </div>
        <div class="team-list">
          ${ids.map(id=>{const p=getPlayer(id);return`<div class="player-row"><span>${escapeHtml(p?.nickname||"-")}</span></div>`}).join("")||`<div class="hint">아직 없음</div>`}
        </div>
      </div>
    `;
  };
  $("draftArea").innerHTML=teamHtml("A",state.draft.teamA)+teamHtml("B",state.draft.teamB);
}

function renderMaps(){
  $("mapPool").innerHTML=state.maps.map((m,i)=>`<div class="map-item"><label><input type="checkbox" ${m.enabled?"checked":""} onchange="toggleMap(${i},this.checked)" />${escapeHtml(m.name)}</label></div>`).join("");
  document.querySelectorAll("input[name='mapMode']").forEach(r=>{r.checked=r.value===state.mapMode});
  const manualSelect=$("manualMapSelect");
  manualSelect.innerHTML=state.maps.filter(m=>m.enabled).map(m=>`<option value="${m.name}" ${state.selectedMap===m.name?"selected":""}>${m.name}</option>`).join("");
  $("pickRandomMapBtn").style.display=state.mapMode==="RANDOM"?"block":"none";
  manualSelect.style.display=state.mapMode==="MANUAL"?"block":"none";
  $("mapRouletteBox").classList.toggle("hidden",state.mapMode!=="RANDOM");
  $("selectedMapBox").textContent=`선택 맵: ${state.selectedMap||"없음"}`;
  if(!mapSpinTimer){$("mapRouletteName").textContent=state.selectedMap||"-";$("mapRouletteName").classList.remove("spinning","final")}
}
function toggleMap(index,enabled){
  state.maps[index].enabled=enabled;
  if(!state.maps.some(m=>m.name===state.selectedMap&&m.enabled))state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";
  saveState();
}
function setMapMode(mode){state.mapMode=mode;if(mode==="MANUAL"&&!state.selectedMap)state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";saveState()}
function pickRandomMap(){
  const enabled=state.maps.filter(m=>m.enabled).map(m=>m.name);
  if(enabled.length===0)return alert("체크된 맵이 없습니다.");
  const finalMap=enabled[Math.floor(Math.random()*enabled.length)];
  const nameBox=$("mapRouletteName");
  const randomBtn=$("pickRandomMapBtn");
  clearTimeout(mapSpinTimer);
  nameBox.classList.remove("final");
  nameBox.classList.add("spinning");
  randomBtn.disabled=true;
  randomBtn.textContent="맵 선정 중...";
  let tick=0,delay=45;
  const spinStep=()=>{
    nameBox.textContent=enabled[Math.floor(Math.random()*enabled.length)];
    tick+=1;
    clearTimeout(mapSpinTimer);
    if(tick<18){delay+=6;mapSpinTimer=setTimeout(spinStep,delay)}
    else if(tick<28){delay+=24;mapSpinTimer=setTimeout(spinStep,delay)}
    else{
      nameBox.textContent=finalMap;
      nameBox.classList.remove("spinning");
      nameBox.classList.add("final");
      state.selectedMap=finalMap;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      renderResultText();
      $("selectedMapBox").textContent=`선택 맵: ${state.selectedMap}`;
      randomBtn.disabled=false;
      randomBtn.textContent="랜덤 맵 뽑기";
      mapSpinTimer=null;
    }
  };
  spinStep();
}
function resetMaps(){state.maps=defaultMaps.map(name=>({name,enabled:true}));state.selectedMap="";saveState()}

function renderMiniGame(){
  document.querySelectorAll(".tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.game===state.activeGame));
  $("rouletteGame").classList.toggle("hidden",state.activeGame!=="roulette");
  $("coinGame").classList.toggle("hidden",state.activeGame!=="coin");
  $("rouletteWheel").style.transform=`rotate(${state.rouletteDeg}deg)`;
  $("coin").style.transform=`rotateY(${state.coinDeg||0}deg)`;
}
function normalizeDeg(deg){return((deg%360)+360)%360}
function spinRoulette(){
  const winner=Math.random()<.5?"A":"B";
  const current=normalizeDeg(state.rouletteDeg);
  const desired=winner==="A"?0:180;
  const delta=normalizeDeg(desired-current);
  state.rouletteDeg+=360*6+delta;
  $("rouletteResult").textContent="결과 확인 중...";
  saveState();
  setTimeout(()=>{$("rouletteResult").textContent=`결과: ${getTeamName(winner)}`},2900);
}
function flipCoin(){
  const winner=Math.random()<.5?"A":"B";
  const current=normalizeDeg(state.coinDeg||0);
  const desired=winner==="A"?0:180;
  const delta=normalizeDeg(desired-current);
  state.coinDeg=(state.coinDeg||0)+360*5+delta;
  $("coinResult").textContent="결과 확인 중...";
  saveState();
  setTimeout(()=>{$("coinResult").textContent=`결과: ${getTeamName(winner)}`},1400);
}
function renderResultText(){
  const teamAName=getTeamName("A");
  const teamBName=getTeamName("B");
  const teamA=state.draft.teamA.map(id=>getPlayer(id)?.nickname).filter(Boolean);
  const teamB=state.draft.teamB.map(id=>getPlayer(id)?.nickname).filter(Boolean);
  const defense=state.attackTeam==="A"?"B":"A";
  $("versusTitle").textContent=`${teamAName} VS ${teamBName}`;
  const lineInfo=state.lines.map(line=>`${line.lineNo}라인: ${line.players[0].nickname.trim()||"-"} ${relationToSign(line.relation)} ${line.players[1].nickname.trim()||"-"}`).join("\n");
  const text=[
    "===== 발로란트 내전 =====","",
    `${teamAName} VS ${teamBName}`,"",
    `맵: ${state.selectedMap||"미정"}`,
    `선공격: ${getTeamName(state.attackTeam)}`,
    `선수비: ${getTeamName(defense)}`,"",
    `[드래프트 모드] ${({PAIR:"페어 드래프트",FREE:"자유 드래프트",RANDOM:"랜덤 팀 배정"}[state.draft.mode]||"페어 드래프트")}`,"",
    "[밸런스 라인]",lineInfo,"",
    `[${teamAName}]`,...(teamA.length?teamA.map((n,i)=>`${i+1}. ${n}`):["-"]),"",
    `[${teamBName}]`,...(teamB.length?teamB.map((n,i)=>`${i+1}. ${n}`):["-"])
  ].join("\n");
  $("resultText").textContent=text;
}
async function copyResult(){
  try{await navigator.clipboard.writeText($("resultText").textContent);alert("결과를 복사했습니다.")}
  catch{alert("복사에 실패했습니다. 직접 선택해서 복사해주세요.")}
}
function resetAll(){
  if(!confirm("전체 데이터를 초기화할까요?"))return;
  state=structuredClone(initialState);
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
}
function escapeHtml(str){return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function renderAll(){renderTheme();renderPlayers();renderLines();renderDraft();renderMaps();renderMiniGame();renderResultText()}

$("startDraftBtn").addEventListener("click",startDraft);
$("resetDraftBtn").addEventListener("click",()=>resetDraft(true));
$("resetMapsBtn").addEventListener("click",resetMaps);
$("pickRandomMapBtn").addEventListener("click",pickRandomMap);
$("manualMapSelect").addEventListener("change",e=>{state.selectedMap=e.target.value;saveState()});
document.querySelectorAll("input[name='mapMode']").forEach(r=>r.addEventListener("change",e=>setMapMode(e.target.value)));
document.querySelectorAll("input[name='draftMode']").forEach(r=>r.addEventListener("change",e=>setDraftMode(e.target.value)));
$("copyResultBtn").addEventListener("click",copyResult);
$("resetAllBtn").addEventListener("click",resetAll);
document.querySelectorAll(".theme-btn").forEach(btn=>btn.addEventListener("click",()=>setTheme(btn.dataset.theme)));
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{state.activeGame=btn.dataset.game;saveState()}));
$("spinRouletteBtn").addEventListener("click",spinRoulette);
$("flipCoinBtn").addEventListener("click",flipCoin);

if(!state.selectedMap)state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";
renderAll();
