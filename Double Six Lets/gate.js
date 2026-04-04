(function(){
  const PASS_HASH='a]D66!x'; // simple obfuscation — not military-grade, just keeps casual visitors out
  const CORRECT='Double66!';
  const AUTH_KEY='dsl_auth';

  if(sessionStorage.getItem(AUTH_KEY)==='1')return; // already authenticated this session

  // Block page content
  document.documentElement.style.overflow='hidden';

  // Create gate overlay
  const gate=document.createElement('div');
  gate.id='dsl-gate';
  gate.innerHTML=`
  <style>
    #dsl-gate{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1a1a2e;font-family:'DM Sans',sans-serif;perspective:1200px;}
    #dsl-gate *{box-sizing:border-box;margin:0;padding:0;}

    /* Street scene */
    .gate-street{position:absolute;bottom:0;left:0;right:0;height:80px;background:#2d2d3f;}
    .gate-street::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#3d3d50;}

    /* Door frame */
    .gate-frame{position:relative;width:240px;height:380px;background:#2a2a3e;border-radius:8px 8px 0 0;border:3px solid #3d3d50;margin-bottom:0;transform-style:preserve-3d;}
    .gate-frame::before{content:'';position:absolute;top:-18px;left:-12px;right:-12px;height:22px;background:#3d3d50;border-radius:6px 6px 0 0;} /* lintel */

    /* Door */
    .gate-door{position:absolute;inset:8px;background:linear-gradient(165deg,#d4600a 0%,#c45509 40%,#a8470a 100%);border-radius:6px 6px 0 0;transform-origin:left center;transition:transform 1.2s cubic-bezier(.4,.0,.2,1);transform-style:preserve-3d;box-shadow:inset 0 0 30px rgba(0,0,0,.15),inset -3px 0 8px rgba(0,0,0,.1);}
    .gate-door.open{transform:rotateY(-105deg);}

    /* Door panels */
    .gate-door::before{content:'';position:absolute;top:30px;left:18px;right:18px;height:120px;border:2px solid rgba(0,0,0,.12);border-radius:4px;}
    .gate-door::after{content:'';position:absolute;bottom:50px;left:18px;right:18px;height:140px;border:2px solid rgba(0,0,0,.12);border-radius:4px;}

    /* Number */
    .gate-number{position:absolute;top:46px;left:50%;transform:translateX(-50%);font-family:'DM Serif Display',serif;font-size:42px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.3);z-index:2;letter-spacing:2px;transition:opacity .4s;}
    .gate-door.open .gate-number{opacity:0;}

    /* Door handle */
    .gate-handle{position:absolute;right:22px;top:52%;width:10px;height:32px;background:linear-gradient(180deg,#e8c547,#c4a23a);border-radius:5px;z-index:2;box-shadow:0 2px 4px rgba(0,0,0,.3);}
    .gate-handle::after{content:'';position:absolute;right:-3px;top:8px;width:8px;height:8px;background:#c4a23a;border-radius:50%;border:1px solid #a8872f;}

    /* Letterbox */
    .gate-letterbox{position:absolute;top:195px;left:50%;transform:translateX(-50%);width:80px;height:12px;background:linear-gradient(180deg,#e8c547,#c4a23a);border-radius:2px;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.2);}

    /* Light inside (visible when door opens) */
    .gate-inside{position:absolute;inset:8px;background:linear-gradient(180deg,#fef3c7 0%,#fde68a 50%,#f59e0b33 100%);border-radius:6px 6px 0 0;z-index:-1;}

    /* Welcome mat */
    .gate-mat{width:200px;height:24px;background:#5c4033;border-radius:3px;margin-top:0;box-shadow:0 2px 6px rgba(0,0,0,.3);}

    /* Form */
    .gate-form{margin-top:32px;display:flex;flex-direction:column;align-items:center;gap:12px;transition:opacity .5s;}
    .gate-form.hidden{opacity:0;pointer-events:none;}
    .gate-label{color:#8b8ba0;font-size:13px;letter-spacing:1px;text-transform:uppercase;}
    .gate-input{width:220px;padding:10px 16px;border-radius:8px;border:2px solid #3d3d50;background:#2a2a3e;color:#fff;font-size:15px;font-family:'DM Sans',sans-serif;text-align:center;outline:none;transition:border-color .2s;}
    .gate-input:focus{border-color:#f97316;}
    .gate-input.error{border-color:#e11d48;animation:shake .4s ease;}
    .gate-enter{padding:8px 28px;border-radius:8px;border:none;background:#f97316;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 12px rgba(249,115,22,.3);transition:transform .15s,box-shadow .15s;}
    .gate-enter:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(249,115,22,.4);}
    .gate-error-msg{color:#e11d48;font-size:12px;height:16px;}

    /* Welcome text after door opens */
    .gate-welcome{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:'DM Serif Display',serif;font-size:28px;opacity:0;transition:opacity .6s .6s;}
    .gate-welcome.show{opacity:1;}

    @keyframes shake{0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-6px);}40%,80%{transform:translateX(6px);}}

    /* Fade out entire gate */
    #dsl-gate.leaving{opacity:0;transition:opacity .5s .8s;}
  </style>

  <div class="gate-frame">
    <div class="gate-inside"></div>
    <div class="gate-door" id="gateDoor">
      <span class="gate-number">66</span>
      <div class="gate-handle"></div>
      <div class="gate-letterbox"></div>
    </div>
  </div>
  <div class="gate-mat"></div>

  <div class="gate-form" id="gateForm">
    <div class="gate-label">Enter Password</div>
    <input type="password" class="gate-input" id="gateInput" placeholder="Password" autocomplete="off" autofocus>
    <button class="gate-enter" id="gateBtn" onclick="dslCheckPass()">Enter</button>
    <div class="gate-error-msg" id="gateError"></div>
  </div>

  <div class="gate-welcome" id="gateWelcome">Welcome to Double Six Lets</div>
  <div class="gate-street"></div>
  `;

  document.body.prepend(gate);

  // Focus input after render
  setTimeout(()=>{
    const inp=document.getElementById('gateInput');
    if(inp)inp.focus();
  },100);

  // Enter key
  document.getElementById('gateInput').addEventListener('keydown',function(e){
    if(e.key==='Enter')dslCheckPass();
  });

  window.dslCheckPass=function(){
    const inp=document.getElementById('gateInput');
    const val=inp.value;
    if(val===CORRECT){
      // Success — animate door open
      sessionStorage.setItem(AUTH_KEY,'1');
      document.getElementById('gateDoor').classList.add('open');
      document.getElementById('gateForm').classList.add('hidden');
      document.getElementById('gateWelcome').classList.add('show');

      // Remove gate after animation
      setTimeout(()=>{
        gate.classList.add('leaving');
        setTimeout(()=>{
          gate.remove();
          document.documentElement.style.overflow='';
        },600);
      },1400);
    }else{
      // Wrong password
      inp.classList.add('error');
      document.getElementById('gateError').textContent='Incorrect password';
      setTimeout(()=>{inp.classList.remove('error');},500);
      inp.value='';
      inp.focus();
    }
  };
})();
