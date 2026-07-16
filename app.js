const STORAGE_KEY="valorant-scrim-tool-v17";

const defaultMaps=[
  {name:"스플릿",slug:"split"},
  {name:"바인드",slug:"bind"},
  {name:"헤이븐",slug:"haven"},
  {name:"어센트",slug:"ascent"},
  {name:"아이스박스",slug:"icebox"},
  {name:"브리즈",slug:"breeze"},
  {name:"프랙처",slug:"fracture"},
  {name:"펄",slug:"pearl"},
  {name:"로터스",slug:"lotus"},
  {name:"선셋",slug:"sunset"},
  {name:"어비스",slug:"abyss"},
  {name:"코로드",slug:"corrode"},
  {name:"서밋",slug:"summit"}
];

const initialState={
  lines:Array.from({length:5},(_,i)=>({
    lineNo:i+1,
    players:[
      {id:crypto.randomUUID(),nickname:""},
      {id:crypto.randomUUID(),nickname:""}
    ],
    relation:"EQUAL"
  })),
  captainLineNo:1,
  draft:{
    started:false,
    mode:"PAIR",
    firstPickTeam:"A",
    currentPickTeam:"A",
    picks:[],
    history:[],
    teamA:[],
    teamB:[]
  },
  maps:defaultMaps.map(map=>({...map,enabled:true})),
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
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function saveState(){persist();renderAll()}

function loadState(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(!saved)return structuredClone(initialState);
    const parsed=JSON.parse(saved);
    if(!parsed.lines?.[0]?.players)return structuredClone(initialState);

    return {
      ...structuredClone(initialState),
      ...parsed,
      draft:{...structuredClone(initialState).draft,...parsed.draft},
      maps:Array.isArray(parsed.maps)&&parsed.maps.length
        ? parsed.maps.map(m=>({...defaultMaps.find(d=>d.name===m.name),...m}))
        : structuredClone(initialState.maps)
    };
  }catch{
    return structuredClone(initialState);
  }
}

function getAllPlayers(){return state.lines.flatMap(line=>line.players)}
function getPlayer(id){return getAllPlayers().find(p=>p.id===id)}
function filledPlayers(){return getAllPlayers().filter(p=>p.nickname.trim())}
function getCaptainLine(){return state.lines.find(line=>line.lineNo===state.captainLineNo)||state.lines[0]}
function relationToSign(relation){if(relation==="LEFT_HIGH")return ">";if(relation==="RIGHT_HIGH")return "<";return "="}
function signToRelation(sign){if(sign===">")return"LEFT_HIGH";if(sign==="<")return"RIGHT_HIGH";return"EQUAL"}

function rankLabel(line,playerId){
  if(line.relation==="EQUAL")return null;
  const idx=line.players.findIndex(p=>p.id===playerId);
  const isHigh=(line.relation==="LEFT_HIGH"&&idx===0)||(line.relation==="RIGHT_HIGH"&&idx===1);
  return isHigh?{text:"윗밸",cls:"rank-high"}:{text:"아랫밸",cls:"rank-low"};
}

function getTeamName(team){
  const captainLine=getCaptainLine();
  const captainIds=captainLine.players.map(p=>p.id);
  const teamIds=team==="A"?state.draft.teamA:state.draft.teamB;
  const captainId=teamIds.find(id=>captainIds.includes(id));
  const captain=getPlayer(captainId);

  if(captain?.nickname?.trim())return `${captain.nickname.trim()}팀`;

  const fallback=team==="A"
    ? captainLine.players[0]?.nickname?.trim()
    : captainLine.players[1]?.nickname?.trim();

  return fallback?`${fallback}팀`:`Team ${team}`;
}

function isPicked(id){return state.draft.teamA.includes(id)||state.draft.teamB.includes(id)}
function pickedTeam(id){
  if(state.draft.teamA.includes(id))return "A";
  if(state.draft.teamB.includes(id))return "B";
  return "";
}
function otherTeam(team){return team==="A"?"B":"A"}
function nextPickTeam(){return state.draft.teamA.length<=state.draft.teamB.length?"A":"B"}

function isLineDone(line){
  if(line.lineNo===state.captainLineNo)return true;
  const ids=line.players.map(p=>p.id);
  if(state.draft.mode==="PAIR")return ids.some(id=>isPicked(id));
  return ids.every(id=>isPicked(id));
}

function renderTheme(){
  document.body.dataset.theme=state.theme||"valorant";
  document.querySelectorAll(".theme-btn").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.theme===state.theme);
  });
}
function setTheme(theme){state.theme=theme;saveState()}
function renderPlayers(){$("playerCountBadge").textContent=`${filledPlayers().length} / 10`}

function renderLines(){
  $("lines").innerHTML=state.lines.map((line,lineIdx)=>{
    const captainSelected=line.lineNo===state.captainLineNo;
    return `
      <div class="line-card ${captainSelected?"captain-line-selected":""}">
        <button type="button" class="captain-line-btn ${captainSelected?"active":""}" onclick="setCaptainLine(${line.lineNo})" title="팀장 라인 지정">★</button>
        <div class="line-title">
          <span>${line.lineNo}라인</span>
          <span>${captainSelected?"팀장":"일반"}</span>
        </div>
        <input type="text" value="${escapeHtml(line.players[0].nickname)}" placeholder="${line.lineNo}라인 왼쪽" maxlength="20" oninput="setLineNickname(${lineIdx},0,this.value)" />
        <div class="balance-sign">
          <select class="balance-select" onchange="setLineSign(${lineIdx},this.value)">
            <option value="=" ${line.relation==="EQUAL"?"selected":""}>=</option>
            <option value=">" ${line.relation==="LEFT_HIGH"?"selected":""}>&gt;</option>
            <option value="<" ${line.relation==="RIGHT_HIGH"?"selected":""}>&lt;</option>
          </select>
        </div>
        <input type="text" value="${escapeHtml(line.players[1].nickname)}" placeholder="${line.lineNo}라인 오른쪽" maxlength="20" oninput="setLineNickname(${lineIdx},1,this.value)" />
      </div>
    `;
  }).join("");
}

function setCaptainLine(lineNo){
  state.captainLineNo=lineNo;
  resetDraft(false);
  saveState();
}

function setLineNickname(lineIdx,slotIdx,nickname){
  state.lines[lineIdx].players[slotIdx].nickname=nickname;
  resetDraft(false);
  persist();
  renderPlayers();
  renderDraft();
  renderResultText();
}

function setLineSign(lineIdx,sign){
  state.lines[lineIdx].relation=signToRelation(sign);
  saveState();
}

function validateLines(){
  const names=getAllPlayers().map(p=>p.nickname.trim());
  if(names.some(name=>!name))return"모든 라인에 닉네임을 2명씩 입력하세요.";
  const duplicated=names.find((name,idx)=>names.indexOf(name)!==idx);
  if(duplicated)return`중복 닉네임이 있습니다: ${duplicated}`;
  if(!getCaptainLine().players.every(p=>p.nickname.trim()))return"팀장 라인에 두 명을 모두 입력하세요.";
  return"";
}

function setDraftMode(mode){
  state.draft.mode=mode;
  resetDraft(false);
  persist();
  renderDraft();
  renderResultText();
}

function createDraftSnapshot(){
  return {
    started:state.draft.started,
    mode:state.draft.mode,
    firstPickTeam:state.draft.firstPickTeam,
    currentPickTeam:state.draft.currentPickTeam,
    picks:structuredClone(state.draft.picks),
    teamA:[...state.draft.teamA],
    teamB:[...state.draft.teamB]
  };
}

function pushDraftHistory(){
  state.draft.history.push(createDraftSnapshot());
}

function restoreDraftSnapshot(snapshot){
  const history=state.draft.history;
  state.draft={...snapshot,history};
}

function setCurrentPickTeam(team){
  if(!state.draft.started||state.draft.mode==="RANDOM")return;
  if(state.draft.currentPickTeam===team)return;

  const target=team==="A"?state.draft.teamA:state.draft.teamB;
  if(target.length>=5)return alert(`${getTeamName(team)}은 이미 5명입니다.`);

  pushDraftHistory();
  state.draft.currentPickTeam=team;
  persist();
  renderDraft();
}

function undoDraftAction(){
  if(!state.draft.history.length)return alert("되돌릴 드래프트 기록이 없습니다.");

  const snapshot=state.draft.history.pop();
  restoreDraftSnapshot(snapshot);
  persist();
  renderDraft();
  renderResultText();
}

function setFirstPickTeam(team){
  if(state.draft.started||state.draft.teamA.length>0||state.draft.teamB.length>0)return;
  state.draft.firstPickTeam=team;
  state.draft.currentPickTeam=team;
  persist();
  renderDraft();
}

function assignCaptains(){
  const [captainA,captainB]=getCaptainLine().players;
  state.draft.teamA=[captainA.id];
  state.draft.teamB=[captainB.id];
  state.draft.picks=[{
    mode:"CAPTAIN",
    lineNo:state.captainLineNo,
    aPlayerId:captainA.id,
    bPlayerId:captainB.id
  }];
  state.draft.currentPickTeam=state.draft.firstPickTeam||"A";
  state.draft.history=[];
}

function startDraft(){
  const error=validateLines();
  if(error)return alert(error);

  const mode=state.draft.mode;
  resetDraft(false);
  state.draft.mode=mode;
  assignCaptains();

  if(mode==="RANDOM"){
    randomAssignTeams();
    state.draft.started=false;
  }else{
    state.draft.started=true;
  }

  saveState();
}

function resetDraft(shouldRender=true){
  const mode=state.draft.mode||"PAIR";
  const firstPickTeam=state.draft.firstPickTeam||"A";
  state.draft={
    started:false,
    mode,
    firstPickTeam,
    currentPickTeam:firstPickTeam,
    picks:[],
    history:[],
    teamA:[],
    teamB:[]
  };
  if(shouldRender)saveState();
}

function randomAssignTeams(){
  state.lines
    .filter(line=>line.lineNo!==state.captainLineNo)
    .forEach(line=>{
      const players=[...line.players];
      if(Math.random()<.5)players.reverse();
      state.draft.teamA.push(players[0].id);
      state.draft.teamB.push(players[1].id);
      state.draft.picks.push({
        mode:"RANDOM",
        lineNo:line.lineNo,
        aPlayerId:players[0].id,
        bPlayerId:players[1].id
      });
    });
}

function pickPlayer(playerId){
  const draft=state.draft;
  if(!draft.started||draft.mode==="RANDOM"||isPicked(playerId))return;

  const line=state.lines.find(l=>l.players.some(p=>p.id===playerId));
  if(!line||line.lineNo===state.captainLineNo)return;

  pushDraftHistory();

  if(draft.mode==="PAIR"){
    const ids=line.players.map(p=>p.id);
    if(ids.some(id=>isPicked(id)))return;

    const pickTeam=draft.currentPickTeam;
    const remainTeam=otherTeam(pickTeam);
    const otherId=ids.find(id=>id!==playerId);

    draft[pickTeam==="A"?"teamA":"teamB"].push(playerId);
    draft[remainTeam==="A"?"teamA":"teamB"].push(otherId);
    draft.picks.push({mode:"PAIR",lineNo:line.lineNo,pickTeam,pickedPlayerId:playerId,autoPlayerId:otherId});
  }else{
    const pickTeam=draft.currentPickTeam;
    const targetTeam=pickTeam==="A"?draft.teamA:draft.teamB;

    if(targetTeam.length>=5){
      state.draft.history.pop();
      draft.currentPickTeam=otherTeam(pickTeam);
      return pickPlayer(playerId);
    }

    targetTeam.push(playerId);
    draft.picks.push({mode:"FREE",lineNo:line.lineNo,pickTeam,pickedPlayerId:playerId});
  }

  if(draft.teamA.length===5&&draft.teamB.length===5){
    draft.started=false;
  }else{
    draft.currentPickTeam=otherTeam(draft.currentPickTeam);
  }

  saveState();
}

function setAttackTeam(team){state.attackTeam=team;saveState()}

function renderDraft(){
  document.querySelectorAll("input[name='draftMode']").forEach(r=>{
    r.checked=r.value===state.draft.mode;
    r.disabled=state.draft.started||state.draft.teamA.length>0||state.draft.teamB.length>0;
  });

  document.querySelectorAll(".first-pick-btn").forEach(btn=>{
    const locked=state.draft.started||state.draft.teamA.length>0||state.draft.teamB.length>0;
    btn.classList.toggle("active",btn.dataset.team===state.draft.firstPickTeam);
    btn.disabled=locked;
  });

  const turnLocked=!state.draft.started||state.draft.mode==="RANDOM";
  document.querySelectorAll(".turn-team-btn").forEach(btn=>{
    btn.textContent=getTeamName(btn.dataset.team);
    btn.classList.toggle("active",btn.dataset.team===state.draft.currentPickTeam);
    btn.disabled=turnLocked||(btn.dataset.team==="A"?state.draft.teamA.length:state.draft.teamB.length)>=5;
  });

  $("undoPickBtn").disabled=state.draft.history.length===0;
  $("turnControlBox").classList.toggle("inactive",turnLocked);

  const modeLabel={PAIR:"페어 드래프트",FREE:"자유 드래프트",RANDOM:"랜덤 팀 배정"}[state.draft.mode];

  if(!state.draft.started&&state.draft.teamA.length===0&&state.draft.teamB.length===0){
    $("draftStatus").textContent=`드래프트를 시작하세요. 팀장 라인: ${state.captainLineNo}라인 · ${modeLabel}`;
  }else if(!state.draft.started&&state.draft.teamA.length===5&&state.draft.teamB.length===5){
    $("draftStatus").textContent=`드래프트 완료 · ${modeLabel}`;
  }else{
    $("draftStatus").textContent=`현재 차례: ${getTeamName(state.draft.currentPickTeam)} · 자동 교대 / 필요 시 현재 선택 팀 변경 가능`;
  }

  renderDraftBoard();
  renderTeams();
}

function renderDraftBoard(){
  $("draftBoard").innerHTML=state.lines.map(line=>{
    const isCaptain=line.lineNo===state.captainLineNo;
    const done=isLineDone(line);

    return `
      <div class="draft-line ${done?"done":""} ${isCaptain?"captain-draft-line":""}">
        <div class="draft-line-head">
          <span>${line.lineNo}라인 ${isCaptain?"· 팀장 라인":""}</span>
          <span>${isCaptain?"자동 배정":done?"선택 완료":"선택 가능"}</span>
        </div>
        <div class="draft-line-main">
          ${renderDraftPlayerButton(line,line.players[0],isCaptain)}
          <div class="draft-sign">${escapeHtml(relationToSign(line.relation))}</div>
          ${renderDraftPlayerButton(line,line.players[1],isCaptain)}
        </div>
      </div>
    `;
  }).join("");
}

function renderDraftPlayerButton(line,player,isCaptain){
  const team=pickedTeam(player.id);
  const picked=!!team;
  const rank=rankLabel(line,player.id);
  const disabled=isCaptain||!state.draft.started||state.draft.mode==="RANDOM"||picked||(state.draft.mode==="PAIR"&&isLineDone(line));

  let tag="";
  if(isCaptain)tag=picked?`${getTeamName(team)} 팀장`:"팀장";
  else if(picked)tag=`${getTeamName(team)} 선택됨`;
  else if(rank)tag=rank.text;
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
          ${ids.map((id,idx)=>{
            const p=getPlayer(id);
            return `<div class="player-row"><span>${escapeHtml(p?.nickname||"-")}${idx===0?" · 팀장":""}</span></div>`;
          }).join("")||`<div class="hint">아직 없음</div>`}
        </div>
      </div>
    `;
  };

  $("draftArea").innerHTML=teamHtml("A",state.draft.teamA)+teamHtml("B",state.draft.teamB);
}

function renderMaps(){
  $("mapPool").innerHTML=state.maps.map((m,i)=>`
    <button type="button" class="map-card ${m.enabled?"enabled":"disabled"}" onclick="toggleMap(${i},${!m.enabled})" aria-pressed="${m.enabled}">
      <img src="./images/maps/${m.slug}.webp" alt="${escapeHtml(m.name)} 맵 이미지" />
      <span class="map-card-overlay"></span>
      <span class="map-card-name">${escapeHtml(m.name)}</span>
      <span class="map-card-state">${m.enabled?"포함":"제외"}</span>
    </button>
  `).join("");

  document.querySelectorAll("input[name='mapMode']").forEach(r=>{r.checked=r.value===state.mapMode});

  const manualSelect=$("manualMapSelect");
  manualSelect.innerHTML=state.maps.filter(m=>m.enabled).map(m=>`<option value="${m.name}" ${state.selectedMap===m.name?"selected":""}>${m.name}</option>`).join("");

  $("pickRandomMapBtn").style.display=state.mapMode==="RANDOM"?"block":"none";
  manualSelect.style.display=state.mapMode==="MANUAL"?"block":"none";
  $("mapRouletteBox").classList.toggle("hidden",state.mapMode!=="RANDOM");
  $("selectedMapBox").textContent=`선택 맵: ${state.selectedMap||"없음"}`;

  if(!mapSpinTimer){
    $("mapRouletteName").textContent=state.selectedMap||"-";
    $("mapRouletteName").classList.remove("spinning","final");
  }
}

function toggleMap(index,enabled){
  state.maps[index].enabled=enabled;
  if(!state.maps.some(m=>m.name===state.selectedMap&&m.enabled)){
    state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";
  }
  saveState();
}

function setMapMode(mode){
  state.mapMode=mode;
  if(mode==="MANUAL"&&!state.selectedMap){
    state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";
  }
  saveState();
}

function pickRandomMap(){
  const enabled=state.maps.filter(m=>m.enabled).map(m=>m.name);
  if(enabled.length===0)return alert("포함된 맵이 없습니다.");

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

    if(tick<18){
      delay+=6;
      mapSpinTimer=setTimeout(spinStep,delay);
    }else if(tick<28){
      delay+=24;
      mapSpinTimer=setTimeout(spinStep,delay);
    }else{
      nameBox.textContent=finalMap;
      nameBox.classList.remove("spinning");
      nameBox.classList.add("final");
      state.selectedMap=finalMap;
      persist();
      renderResultText();
      $("selectedMapBox").textContent=`선택 맵: ${state.selectedMap}`;
      randomBtn.disabled=false;
      randomBtn.textContent="랜덤 맵 뽑기";
      mapSpinTimer=null;
    }
  };

  spinStep();
}

function resetMaps(){
  state.maps=defaultMaps.map(map=>({...map,enabled:true}));
  state.selectedMap="";
  saveState();
}

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
  const modeLabel={PAIR:"페어 드래프트",FREE:"자유 드래프트",RANDOM:"랜덤 팀 배정"}[state.draft.mode];

  $("versusTitle").textContent=`${teamAName} VS ${teamBName}`;

  const lineInfo=state.lines.map(line=>{
    const captainMark=line.lineNo===state.captainLineNo?" [팀장]":"";
    return `${line.lineNo}라인${captainMark}: ${line.players[0].nickname.trim()||"-"} ${relationToSign(line.relation)} ${line.players[1].nickname.trim()||"-"}`;
  }).join("\n");

  $("resultText").textContent=[
    "===== 발로란트 내전 =====","",
    `${teamAName} VS ${teamBName}`,"",
    `맵: ${state.selectedMap||"미정"}`,
    `선공격: ${getTeamName(state.attackTeam)}`,
    `선수비: ${getTeamName(defense)}`,
    `드래프트 모드: ${modeLabel}`,"",
    "[밸런스 라인]",lineInfo,"",
    `[${teamAName}]`,...(teamA.length?teamA.map((n,i)=>`${i+1}. ${n}${i===0?" (팀장)":""}`):["-"]),"",
    `[${teamBName}]`,...(teamB.length?teamB.map((n,i)=>`${i+1}. ${n}${i===0?" (팀장)":""}`):["-"])
  ].join("\n");
}

async function copyResult(){
  try{
    await navigator.clipboard.writeText($("resultText").textContent);
    alert("결과를 복사했습니다.");
  }catch{
    alert("복사에 실패했습니다. 직접 선택해서 복사해주세요.");
  }
}

function resetAll(){
  if(!confirm("전체 데이터를 초기화할까요?"))return;
  state=structuredClone(initialState);
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderAll(){
  renderTheme();
  renderPlayers();
  renderLines();
  renderDraft();
  renderMaps();
  renderMiniGame();
  renderResultText();
}

$("startDraftBtn").addEventListener("click",startDraft);
$("resetDraftBtn").addEventListener("click",()=>resetDraft(true));
$("resetMapsBtn").addEventListener("click",resetMaps);
$("pickRandomMapBtn").addEventListener("click",pickRandomMap);
$("manualMapSelect").addEventListener("change",e=>{state.selectedMap=e.target.value;saveState()});

document.querySelectorAll("input[name='mapMode']").forEach(r=>r.addEventListener("change",e=>setMapMode(e.target.value)));
document.querySelectorAll("input[name='draftMode']").forEach(r=>r.addEventListener("change",e=>setDraftMode(e.target.value)));
document.querySelectorAll(".first-pick-btn").forEach(btn=>btn.addEventListener("click",()=>setFirstPickTeam(btn.dataset.team)));
document.querySelectorAll(".turn-team-btn").forEach(btn=>btn.addEventListener("click",()=>setCurrentPickTeam(btn.dataset.team)));
$("undoPickBtn").addEventListener("click",undoDraftAction);

$("copyResultBtn").addEventListener("click",copyResult);
$("resetAllBtn").addEventListener("click",resetAll);

document.querySelectorAll(".theme-btn").forEach(btn=>btn.addEventListener("click",()=>setTheme(btn.dataset.theme)));
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{state.activeGame=btn.dataset.game;saveState()}));

$("spinRouletteBtn").addEventListener("click",spinRoulette);
$("flipCoinBtn").addEventListener("click",flipCoin);

if(!state.selectedMap){
  state.selectedMap=state.maps.find(m=>m.enabled)?.name||"";
}

renderAll();
