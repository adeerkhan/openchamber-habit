(()=>{var b="openchamber.sdk",G=1;var $_=`
:root {
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 40%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 65%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  :root::-webkit-scrollbar, body::-webkit-scrollbar { background: var(--oc-bg, inherit); }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: var(--oc-scrollbar-thumb);
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  * { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;var B_=128,z_=65536;var s_=["file","directory","other","missing"],K_=(_)=>Boolean(_&&"sessionId"in _),Z_=(_)=>Boolean(_&&"sent"in _&&!("sessionId"in _));var e_=16000,_S=128,SS=200,fS=2000,TS=16000,AS=80,ES=200,bS=16000;var GS=2000;var P_=20000,T_=1024,A_=2000000;var E_=64000,b_=8000,J_=4000;var W_=90000;var kS=999,F_=500,US=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED"],MS=["stopped","starting","ready","failed"],PS=new Set(US),CS=(_)=>PS.has(_),XS=(_)=>_&&CS(_)?_:"HOST_REJECTED",n=(_)=>{if(_===void 0)return!1;if(_===null||_===!0||_===!1)return!0;if(String(_)===_)return!0;if(Number(_)===_)return Number.isFinite(_);if(Array.isArray(_))return _.every(n);if(Object(_)===_)return Object.values(_).every(n);return!1},OS=(_)=>n(_)&&JSON.stringify(_).length<=bS,t_=(_)=>_?.trim().slice(0,ES)??"",u=(_)=>{let T=_.id.trim().slice(0,_S),L=_.title.trim().slice(0,SS),d=_.url.trim().slice(0,fS),F=_.text?.trim().slice(0,TS),j=_.author?.trim().slice(0,AS),w=_.kind==="pull"?"pull":"issue",P={providerId:_.providerId.trim(),id:T,title:L||T,url:d,kind:w};if(F)P.text=F;if(j)P.author=j;if(w==="pull"){let x=t_(_.branches?.head),H=t_(_.branches?.base);if(x&&H)P.branches={head:x,base:H}}if(OS(_.data))P.data=_.data;return P},V_=(_)=>{let T=u(_);if(_.projectId)T.projectId=_.projectId;if(_.navigation)T.navigation=_.navigation;if(_.worktree)T.worktree=_.worktree;return T},I_=(_)=>{let T={text:_.text.trim().slice(0,e_)};if(_.send)T.send=!0;return T},c_=(_)=>{if(_===null||!Number.isFinite(_))return null;return Math.min(kS,Math.max(0,Math.round(_)))};var a=(_)=>_.length>0&&_.length<=T_&&!_.includes("\x00")&&!_.includes("\\");var G_=(_)=>{if(!_.startsWith("/")||_.includes("\x00")||_.includes("\\")||_.includes("://"))return!1;if(_.length>GS)return!1;return!_.split("/").some((L)=>L==="."||L==="..")},JS=new Set(MS),j_=(_)=>Boolean(_&&"status"in _&&JS.has(String(_.status))&&!("body"in _)),k_=(_)=>Boolean(_&&"status"in _&&"body"in _&&Number.isInteger(_.status)),w_=(_)=>Boolean(_&&"content"in _&&String(_.content)===_.content),x_=(_)=>Boolean(_&&"written"in _&&_.written===!0),H_=(_)=>Boolean(_&&"entries"in _&&Array.isArray(_.entries)),WS=new Set(s_),m_=(_)=>Boolean(_&&"kind"in _&&"size"in _&&WS.has(String(_.kind))&&Number.isFinite(_.size)),R_=(_)=>Boolean(_&&"text"in _&&String(_.text)===_.text&&!("status"in _)),FS=new Set(["workspace","ready","directory","session","connection","settings","session-lifecycle","item","resolve"]),VS=(_)=>Object(_)===_?_:null,Q_=(_)=>String(_)===_&&_.length>0,IS=(_)=>{if(!Q_(_.id))return null;if(_.ok===!0){let T={channel:b,v:G,type:"result",id:_.id,ok:!0};if(Object(_.payload)===_.payload)T.payload=_.payload;return T}if(_.ok===!1&&Q_(_.error))return{channel:b,v:G,type:"result",id:_.id,ok:!1,error:_.error,code:XS(Q_(_.code)?_.code:void 0)};return null},d_=(_)=>{let T=VS(_);if(!T||T.channel!==b||T.v!==G)return null;if(T.type==="result")return IS(T);if(!FS.has(String(T.type))||Object(T.payload)!==T.payload)return null;return T};class E extends Error{code;constructor(_,T){super(T);this.name="HostRequestError",this.code=_}}var DS=()=>Promise.reject(new E("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),U_=()=>Promise.reject(new E("BAD_PATH",`File path must be 1 to ${T_} characters without NUL or backslash.`)),U=(_)=>{return _.value+=1,`oc-${_.value}`},h_=(_={})=>{let T=_.target??("window"in globalThis?window:null);if(!T)throw new E("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let L=_.acceptSource??((S)=>S===T.parent),d=_.requestTimeoutMs??P_,F=new Set,j=new Set,w=new Set,P=new Set,x=new Set,H=new Set,r=new Set,t=null,o=new Map,v=new Map,S_=!1,k={value:0},M=null,V=null,i_=(S)=>{if(!S)return null;return{sessionId:S.id,phase:S.busy?"started":"completed"}},l=(S)=>{T.parent.postMessage(S,"*")},Y=(S,f)=>{for(let A of S)try{A(f)}catch(D){console.error(D)}},r_=(S)=>{if(!(S instanceof MessageEvent))return;if(!L(S.source))return;let f=d_(S.data);if(!f)return;if(f.type==="workspace"){let D=v.get(f.payload.subscriptionId);if(D)Y([D],f.payload.snapshot);return}if(f.type==="ready"){if(M=f.payload,V=i_(f.payload.session),Y(F,f.payload),Y(j,f.payload.directory),Y(w,f.payload.session),V)Y(P,V);Y(x,f.payload.connection),Y(H,f.payload.settings),Y(r,f.payload.item);return}if(f.type==="directory"){if(M)M={...M,directory:f.payload.directory};Y(j,f.payload.directory);return}if(f.type==="session"){if(M)M={...M,session:f.payload.session};if(!f.payload.session)V=null;else if(V?.sessionId!==f.payload.session.id)V=i_(f.payload.session);Y(w,f.payload.session);return}if(f.type==="session-lifecycle"){V=f.payload,Y(P,f.payload);return}if(f.type==="connection"){if(M)M={...M,connection:f.payload.connection};Y(x,f.payload.connection);return}if(f.type==="settings"){if(M)M={...M,settings:f.payload.settings};Y(H,f.payload.settings);return}if(f.type==="item"){if(M)M={...M,item:f.payload.item};Y(r,f.payload.item);return}if(f.type==="resolve"){let D=(J)=>{l({channel:b,v:G,type:"resolve-result",id:f.id,payload:J})},m=t;if(!m){D({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>m(f.payload)).then((J)=>D({item:J?u(J):null}),(J)=>{let ZS=(J instanceof Error?J.message:String(J)).trim();D({error:(ZS||"Command failed.").slice(0,F_)})});return}let A=o.get(f.id);if(!A)return;if(clearTimeout(A.timer),o.delete(f.id),f.ok){A.resolve(f.payload);return}A.reject(new E(f.code,f.error))};T.addEventListener("message",r_),l({channel:b,v:G,type:"hello"});let z=(S,f=d)=>{if(S_||T.parent===T)return Promise.reject(new E("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((A,D)=>{let m=setTimeout(()=>{o.delete(S.id),D(new E("HOST_TIMEOUT","Host did not answer in time."))},f);o.set(S.id,{resolve:A,reject:D,timer:m}),l(S)})},Q=(S)=>z(S).then(()=>{return}),h={channel:b,v:G},y=(S,f=1024)=>{if(!S.trim()||S.length>f)throw new E("HOST_REJECTED",`Identity must contain 1 to ${f} characters.`)},N_=async(S)=>{if(S.kind!=="projects")y(S.projectId);let f=await z({...h,type:"workspace-read",id:U(k),payload:S});if(!f||!("kind"in f)||!("state"in f)||f.kind!==S.kind)throw new E("HOST_REJECTED","Host did not return workspace data.");return f},Y_=async(S,f)=>{if(S.kind!=="projects")y(S.projectId);let A=U(k);v.set(A,f);try{await Q({...h,type:"workspace-subscribe",id:U(k),payload:{subscriptionId:A,query:S}})}catch(D){if(v.delete(A),!S_)l({...h,type:"workspace-unsubscribe",id:U(k),payload:{subscriptionId:A}});throw D}return()=>{if(!v.delete(A)||S_)return;l({...h,type:"workspace-unsubscribe",id:U(k),payload:{subscriptionId:A}})}},f_=async(S)=>{if("key"in S&&(S.key.length===0||S.key.length>B_))throw new E("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(S.op==="set"&&!n(S.value))throw new E("HOST_REJECTED","Storage values must be JSON.");if(S.op==="set"&&new TextEncoder().encode(JSON.stringify(S.value)).length>z_)throw new E("HOST_REJECTED","Storage value exceeds 64 KiB.");let f=await z({...h,type:"storage",id:U(k),payload:S});if(!f||!("storage"in f)||f.op!==S.op)throw new E("HOST_REJECTED","Host did not return storage data.");return f};return{listProjects:async()=>{let S=await N_({kind:"projects"});if(S.kind!=="projects")throw new E("HOST_REJECTED","Expected projects.");return S},listWorktrees:async(S)=>{let f=await N_({kind:"worktrees",projectId:S});if(f.kind!=="worktrees")throw new E("HOST_REJECTED","Expected worktrees.");return f},listSessions:async(S)=>{let f=await N_({kind:"sessions",projectId:S});if(f.kind!=="sessions")throw new E("HOST_REJECTED","Expected sessions.");return f},onProjects:(S)=>Y_({kind:"projects"},(f)=>{if(f.kind==="projects")S(f)}),onWorktrees:(S,f)=>Y_({kind:"worktrees",projectId:S},(A)=>{if(A.kind==="worktrees")f(A)}),onSessions:(S,f)=>Y_({kind:"sessions",projectId:S},(A)=>{if(A.kind==="sessions")f(A)}),openSession:async(S)=>{y(S),await Q({...h,type:"open-session",id:U(k),payload:{sessionId:S}})},storage:{get:async(S)=>{let f=await f_({op:"get",key:S});return f.op==="get"&&f.found?f.value:void 0},set:async(S,f)=>{await f_({op:"set",key:S,value:f})},delete:async(S)=>{await f_({op:"delete",key:S})},keys:async()=>{let S=await f_({op:"keys"});if(S.op!=="keys")throw new E("HOST_REJECTED","Expected storage keys.");return S.keys}},onReady:(S)=>{if(F.add(S),M)S(M);return()=>{F.delete(S)}},onDirectory:(S)=>{if(j.add(S),M)S(M.directory);return()=>{j.delete(S)}},onSession:(S)=>{if(w.add(S),M)S(M.session);return()=>{w.delete(S)}},onSessionLifecycle:(S)=>{if(P.add(S),V)S(V);return()=>{P.delete(S)}},onConnection:(S)=>{if(x.add(S),M)S(M.connection);return()=>{x.delete(S)}},onSettings:(S)=>{if(H.add(S),M)S(M.settings);return()=>{H.delete(S)}},onItem:(S)=>{if(r.add(S),M)S(M.item);return()=>{r.delete(S)}},onResolve:(S)=>{return t=S,()=>{if(t===S)t=null}},toast:(S)=>Q({channel:b,v:G,type:"toast",id:U(k),payload:S}),openUrl:(S)=>Q({channel:b,v:G,type:"open-url",id:U(k),payload:{url:S}}),openSurface:(S)=>Q({channel:b,v:G,type:"open-surface",id:U(k),payload:{surfaceId:S}}),writeClipboard:(S)=>Q({channel:b,v:G,type:"clipboard-write",id:U(k),payload:{text:S}}),compose:(S)=>Q({channel:b,v:G,type:"compose",id:U(k),payload:S}),attach:(S)=>Q({channel:b,v:G,type:"attach",id:U(k),payload:u(S)}),startSession:async(S)=>{if(S.projectId!==void 0)y(S.projectId);let f=S.worktree;if(f&&f!==!0)if(f.kind==="existing")y(f.directory);else{if(f.name!==void 0)y(f.name,200);if(f.baseBranch!==void 0)y(f.baseBranch,200)}let A=await z({channel:b,v:G,type:"start-session",id:U(k),payload:V_(S)},_.requestTimeoutMs??180000);if(!K_(A))throw new E("HOST_REJECTED","Host did not return a session.");return A},prompt:(S)=>z({channel:b,v:G,type:"prompt",id:U(k),payload:I_(S)}).then((f)=>{if(!Z_(f))throw new E("HOST_REJECTED","Host did not return a prompt result.");return f}),sessionLink:(S)=>Q({channel:b,v:G,type:"session-link",id:U(k),payload:u(S)}),close:()=>Q({channel:b,v:G,type:"close",id:U(k)}),oauthStart:()=>Q({channel:b,v:G,type:"oauth-start",id:U(k)}),oauthDisconnect:()=>Q({channel:b,v:G,type:"oauth-disconnect",id:U(k)}),request:(S)=>(G_(S.path)?z({channel:b,v:G,type:"request",id:U(k),payload:S}):DS()).then((f)=>{if(!k_(f))throw new E("HOST_REJECTED","Host request result was empty.");return f}),serviceRequest:(S)=>(G_(S.path)?z({channel:b,v:G,type:"service-request",id:U(k),payload:S}):DS()).then((f)=>{if(!k_(f))throw new E("HOST_REJECTED","Host service request result was empty.");return f}),serviceStatus:()=>z({channel:b,v:G,type:"service-status",id:U(k)}).then((S)=>{if(!j_(S))throw new E("HOST_REJECTED","Host did not return service status.");return S}),readFile:(S)=>(a(S)?z({channel:b,v:G,type:"file-read",id:U(k),payload:{path:S}}):U_()).then((f)=>{if(!w_(f))throw new E("HOST_REJECTED","Host did not return file content.");return f}),writeFile:(S,f)=>{if(!a(S))return U_();if(f.length>A_)return Promise.reject(new E("FILE_TOO_LARGE",`Content is over ${A_} characters.`));return z({channel:b,v:G,type:"file-write",id:U(k),payload:{path:S,content:f}}).then((A)=>{if(!x_(A))throw new E("HOST_REJECTED","Host did not confirm the write.");return A})},listDir:(S)=>(a(S)?z({channel:b,v:G,type:"file-list",id:U(k),payload:{path:S}}):U_()).then((f)=>{if(!H_(f))throw new E("HOST_REJECTED","Host did not return directory entries.");return f}),stat:(S)=>(a(S)?z({channel:b,v:G,type:"file-stat",id:U(k),payload:{path:S}}):U_()).then((f)=>{if(!m_(f))throw new E("HOST_REJECTED","Host did not return file status.");return f}),generate:(S)=>{let f=S.prompt.trim(),A=S.system?.trim();if(f.length===0||f.length>E_)return Promise.reject(new E("HOST_REJECTED",`Prompt must be 1 to ${E_} characters.`));if(A!==void 0&&(A.length===0||A.length>b_))return Promise.reject(new E("HOST_REJECTED",`System prompt must be 1 to ${b_} characters.`));let D=S.maxOutputTokens===void 0?void 0:Math.min(J_,Math.max(1,Math.floor(S.maxOutputTokens)));if(D!==void 0&&!Number.isFinite(D))return Promise.reject(new E("HOST_REJECTED","maxOutputTokens must be a number."));let m={prompt:f};if(A!==void 0)m.system=A;if(D!==void 0)m.maxOutputTokens=D;return z({channel:b,v:G,type:"generate",id:U(k),payload:m},_.requestTimeoutMs??W_).then((J)=>{if(!R_(J))throw new E("HOST_REJECTED","Host did not return generated text.");return J})},setBadge:(S)=>Q({channel:b,v:G,type:"badge",id:U(k),payload:{count:c_(S)}}),dispose:()=>{for(let S of v.keys())l({...h,type:"workspace-unsubscribe",id:U(k),payload:{subscriptionId:S}});v.clear(),S_=!0,t=null,T.removeEventListener("message",r_);for(let S of o.values())clearTimeout(S.timer),S.reject(new E("HOST_UNAVAILABLE","Host client was disposed."));o.clear(),F.clear(),j.clear(),w.clear(),P.clear(),x.clear(),H.clear(),r.clear()}}};var cS=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],LS=(_,T)=>{T.style.colorScheme=_.mode;for(let[L,d]of cS)T.style.setProperty(L,_.tokens[d]);T.style.setProperty("font-family",_.tokens.font),T.style.setProperty("font-size","0.875rem"),T.style.setProperty("line-height","1.45"),T.style.setProperty("color",_.tokens.foreground)},y_=(_,T)=>{if(LS(_.theme,T),T.dataset)T.dataset.ocSurface=_.surface,T.dataset.ocTheme=_.theme.mode};var jS={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},C=(_,T)=>`var(--${_}, var(--oc-${jS[_]}, ${T}))`,q=C("surface-background","transparent"),M_=C("surface-elevated","transparent"),s=C("surface-elevated-foreground","inherit"),e=C("surface-foreground","inherit"),X=C("surface-muted-foreground","gray"),wS=C("surface-muted","transparent"),Z=C("interactive-border","currentColor"),K=C("interactive-hover","transparent"),p=C("interactive-active","transparent"),q_=C("interactive-selection","transparent"),p_=C("interactive-selection-foreground","inherit"),$S=C("interactive-focus-ring","currentColor"),W=C("primary","currentColor"),g_=C("primary-text","inherit"),o_=C("error-text","inherit"),xS=C("font-sans","inherit"),v_=C("font-mono","monospace"),NS=C("radius","9px"),O=(_,T,L="transparent")=>`color-mix(in srgb, ${_} ${T}%, ${L})`,YS=`box-shadow: 0 0 0 2px ${$S};`,C_=(_)=>{let T=C(`status-${_}`,"currentColor");return`
.oc-sdk[data-tone="${_}"], .oc-sdk [data-tone="${_}"] { --oc-sdk-tone: ${T}; --oc-sdk-tone-text: ${C(`${_}-text`,"inherit")}; }`},N=`
${$_}
.oc-sdk { box-sizing: border-box; color: ${e}; font-family: ${xS}; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }
.oc-sdk :focus-visible { outline: none; ${YS} }
.oc-sdk-mono { font-family: ${v_}; }
.oc-sdk-muted { color: ${X}; }
${C_("success")}${C_("warning")}${C_("error")}${C_("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${W}; --oc-sdk-tone-text: ${g_}; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 1px solid transparent; border-radius: ${NS}; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="sm"] { height: 32px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { height: 24px; padding: 0 8px; font-size: 0.75rem; border-radius: 6px; }
.oc-sdk-btn[data-variant="default"] { color: ${g_}; background: ${O(W,10,q)}; border-color: ${O(W,12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(W,16,q)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(W,22,q)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${wS}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${p}, ${p}); }
.oc-sdk-btn[data-variant="outline"] { background: ${M_}; color: ${s}; border-color: ${Z}; }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${p}, ${p}); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${K}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${p}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${C("status-error","red")}; color: ${o_}; background: ${O("var(--oc-sdk-tone)",7,q)}; border-color: ${O("var(--oc-sdk-tone)",12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,q)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,q)}; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; color: ${X}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${o_}; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 36px; padding: 0 12px; border: 0; border-radius: ${NS}; background: ${M_}; color: ${s}; font-size: 0.875rem; line-height: 1.45; appearance: none; box-shadow: inset 0 0 0 1px ${O(Z,60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
textarea.oc-sdk-input { height: auto; padding: 8px 12px; resize: vertical; }
.oc-sdk-input::placeholder { color: ${X}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${$S}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${C("status-error","red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${C("status-error","red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${v_}; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${X}; pointer-events: none; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${W}; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: ${X}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }
.oc-sdk-search-clear:hover { background: ${K}; color: ${e}; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 32px; padding: 0 8px 0 10px; border: 1px solid ${Z}; border-radius: 6px; background: ${M_}; color: ${s}; font-size: 0.8125rem; text-align: left; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${K}, ${K}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${p}, ${p}); }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-value[data-empty="true"] { color: ${X}; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; color: ${X}; }
.oc-sdk-popup { --surface-foreground: ${s}; position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid ${O(Z,60)}; border-radius: 12px; background: ${M_}; color: ${s}; box-shadow: 0 8px 24px ${O(e,12)}; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 32px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option[data-active="true"] { background: ${K}; }
.oc-sdk-option[aria-selected="true"] { background: ${q_}; color: ${p_}; }
.oc-sdk-option[data-destructive="true"] { color: ${o_}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(C("status-error","red"),10)}; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; color: ${X}; }
.oc-sdk-option-check { flex: 0 0 auto; width: 12px; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; color: ${X}; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid ${Z}; border-radius: 4px; color: ${W}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(W,65,Z)}; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; border-radius: 9999px; background: ${Z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 9999px; background: ${q}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${W}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${YS} }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; color: ${X}; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; max-width: 100%; overflow: auto; }
.oc-sdk-tabs[data-track="true"] { background: ${O(e,4)}; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; font-size: 0.8125rem; font-weight: 500; color: ${X}; white-space: nowrap; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${e}; }
.oc-sdk-tab[aria-selected="true"] { color: ${p_}; background: ${q_}; border-color: ${Z}; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${X}; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 9999px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; background: ${K}; color: ${X}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; text-align: left; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${K}; }
.oc-sdk-row[aria-selected="true"] { background: ${q_}; color: ${p_}; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${v_}; font-size: 0.75rem; color: ${X}; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: ${X}; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${X}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; color: ${X}; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; color: ${X}; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: ${X}; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid ${Z}; border-top-color: ${W}; border-radius: 9999px; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid ${O("var(--oc-sdk-tone)",40)}; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { font-size: 0.8125rem; color: ${X}; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; color: ${X}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; background: ${O(Z,40)}; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: ${X}; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; border-radius: 9999px; background: ${Z}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; border-radius: 9999px; background: var(--oc-sdk-tone, ${W}); transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text a { color: ${g_}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; border-radius: 8px; border: 1px solid ${O(Z,60)}; }
`;var u_=h_(),__=document.querySelector("#root");if(!__)throw Error("Missing root");__.innerHTML='<main style="padding:12px;display:grid;gap:12px;max-width:100%;box-sizing:border-box;"><style>@keyframes tps-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }</style><section data-view="session"></section><section data-view="turns"></section><section data-view="tokens"></section></main>';var zS=(_)=>_.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),n_=(_,T)=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_};${T?"animation:tps-pulse 1.2s infinite;":""}"></span>`,QS=__.querySelector('[data-view="session"]'),hS=__.querySelector('[data-view="turns"]'),yS=__.querySelector('[data-view="tokens"]'),R=null,c=null,g=null,a_=()=>{if(!R){QS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p>No session open.</p>';return}let _=R.model?zS(R.model):"unknown model",T=R.busy?n_("#ffaa00",!0):n_("#00cc66",!1),L=R.busy?"working":"idle";QS.innerHTML=`<h2 style="font-size:13px;margin:0 0 4px;">Current session</h2><p style="margin:0;"><strong>${zS(R.title||"Untitled")}</strong></p><p style="margin:4px 0 0;opacity:0.75;">${T} ${_} · ${L}</p>`},KS=()=>{let _=[];if(g&&g.endedAt!==null){let T=((g.endedAt-g.startedAt)/1000).toFixed(1),L=g.phase==="completed",d=L?"#00cc66":"#ff4444",F=L?"completed":"failed";_.push(`<p style="margin:0 0 4px;">Last turn: <strong>${T}s</strong> · `+`<strong style="color:${d};">${F}</strong></p>`)}if(c&&c.endedAt===null)_.push(`<p style="margin:0 0 4px;">${n_("#ffaa00",!0)} Turn running…</p>`);if(_.length===0)_.push('<p style="margin:0;">No turns observed yet.</p>');hS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Turns</h2>'+_.join("")},qS=()=>{yS.innerHTML='<h2 style="font-size:13px;margin:0 0 4px;">Tokens</h2><p style="margin:0;opacity:0.75;">Live token throughput is not exposed to extensions yet. See the OpenChamber status bar for the native indicator.</p>'};a_();KS();qS();u_.onReady((_)=>{y_(_,document.documentElement),R=_.session,a_()});u_.onSession((_)=>{R=_,a_()});u_.onSessionLifecycle((_)=>{let T=Date.now();if(_.phase==="started")c={startedAt:T,endedAt:null,phase:"started"};else{if(c&&c.endedAt===null)c.endedAt=T,c.phase=_.phase,g=c;else g={startedAt:T,endedAt:T,phase:_.phase};c=null}KS()});})();
