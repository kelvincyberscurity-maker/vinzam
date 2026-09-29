// Cloudflare Workers single-file Service Worker build.
// Deploy this file directly from Workers & Pages > Create > Upload.
// No npm install, Express, axios, fs, or Node.js runtime is required.
//
// This version supports:
//   - static website
//   - Firebase email-link send/login
//   - Catchmail proxy endpoints
//   - status endpoint
//   - login statistics
//
// The original project contained code intended to activate a paid premium
// subscription using a hard-coded purchase token and spoofed client headers.
// That activation path is intentionally not ported here. The login flow only
// authenticates the user's Firebase account and reports LOGIN_ONLY.

const FALLBACK_FIREBASE_API_KEY = "AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0";
const FIREBASE_ENDPOINT =
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty";
const CATCHMAIL_BASE = "https://api.catchmail.io/api/v1";
const DOMAINS = ["catchmail.io", "mailistry.com", "zeppost.com"];

let memoryStats = {
  total: 0,
  today: 0,
  date: new Date().toISOString().slice(0, 10)
};

const INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>AM — Magic Link Login</title>\n<style>\n*{box-sizing:border-box}\n:root{\n  --cyan:#69e7ff;--mint:#8affd1;--violet:#a98cff;--pink:#ff71c8;\n  --white:#f7f9ff;--muted:#9da7bc;--glass:rgba(13,18,35,.62);\n}\nhtml{scroll-behavior:smooth}\nbody{\n  margin:0;min-height:100vh;color:var(--white);\n  font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;\n  background:\n    radial-gradient(circle at 15% 10%,rgba(105,231,255,.17),transparent 27%),\n    radial-gradient(circle at 86% 16%,rgba(255,113,200,.14),transparent 25%),\n    linear-gradient(120deg,rgba(3,5,13,.9),rgba(4,7,17,.63)),\n    url(\"https://u.pone.rs/vtadimdj.png\") center/cover fixed;\n  overflow-x:hidden;\n}\nbody:before{\n  content:\"\";position:fixed;inset:-30%;z-index:-1;pointer-events:none;\n  background:conic-gradient(from 0deg,transparent,rgba(105,231,255,.08),transparent,rgba(255,113,200,.07),transparent);\n  filter:blur(45px);animation:spin 24s linear infinite;\n}\nbody:after{\n  content:\"\";position:fixed;inset:0;z-index:-1;pointer-events:none;\n  background:linear-gradient(180deg,rgba(2,4,11,.05),rgba(2,4,11,.76));\n}\n.shell{width:min(1240px,calc(100% - 36px));margin:auto;padding:30px 0 55px}\n\n/* NEW HERO */\n.hero{\n  min-height:360px;position:relative;overflow:hidden;border-radius:38px;\n  padding:42px;display:flex;align-items:flex-end;\n  border:1px solid rgba(255,255,255,.15);\n  background:linear-gradient(135deg,rgba(255,255,255,.11),rgba(255,255,255,.025)),rgba(5,9,22,.52);\n  backdrop-filter:blur(25px);box-shadow:0 45px 110px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.14);\n}\n.hero:before{\n  content:\"\";position:absolute;width:390px;height:390px;right:-80px;top:-120px;\n  border-radius:50%;border:1px solid rgba(105,231,255,.3);\n  box-shadow:0 0 0 35px rgba(105,231,255,.025),0 0 0 70px rgba(169,140,255,.02);\n}\n.hero:after{\n  content:\"\";position:absolute;width:280px;height:280px;right:80px;top:-55px;border-radius:50%;\n  background:radial-gradient(circle,rgba(105,231,255,.17),transparent 65%);filter:blur(15px);\n}\n.hero-content{position:relative;z-index:2;max-width:680px}\n.eyebrow{font-size:10px;letter-spacing:.25em;color:var(--mint);font-weight:800;margin-bottom:18px}\n.hero h1{font-size:clamp(42px,7vw,78px);line-height:.9;margin:0;letter-spacing:-.07em}\n.hero h1 em{font-style:normal;background:linear-gradient(90deg,var(--mint),var(--cyan),var(--violet));-webkit-background-clip:text;color:transparent}\n.hero p{max-width:570px;color:var(--muted);font-size:14px;line-height:1.8;margin:22px 0 0}\n.badge{\n  position:absolute;right:30px;top:30px;z-index:3;padding:9px 13px;border-radius:99px;\n  font-size:9px;letter-spacing:.13em;color:var(--mint);border:1px solid rgba(138,255,209,.28);\n  background:rgba(138,255,209,.06);box-shadow:0 0 28px rgba(138,255,209,.08)\n}\n\n/* FLOATING NAV */\n.nav{display:flex;gap:10px;margin:-25px 34px 22px;position:relative;z-index:5}\n.nav a{\n  flex:1;padding:13px 15px;text-align:center;text-decoration:none;color:#aab4c9;\n  border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(8,12,25,.78);\n  backdrop-filter:blur(18px);font-size:11px;box-shadow:0 12px 30px rgba(0,0,0,.28)\n}\n.nav a:first-child{color:var(--white);border-color:rgba(105,231,255,.28)}\n.nav a:hover{color:var(--white);transform:translateY(-2px)}\n\n/* DASHBOARD */\n.dashboard{display:grid;grid-template-columns:1.35fr .65fr;gap:18px}\n.card{\n  position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);\n  border-radius:28px;padding:27px;background:linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.018)),var(--glass);\n  backdrop-filter:blur(23px);box-shadow:0 30px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.07)\n}\n.card:before{content:\"\";position:absolute;left:0;top:0;width:100%;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),var(--pink),transparent);opacity:.65}\n.card h2{font-size:18px;margin:0 0 7px;letter-spacing:-.03em}\n.sub{color:var(--muted);font-size:11px;margin:0 0 22px}\n.steps{display:flex;gap:7px;margin-bottom:22px}\n.steps div{flex:1;padding:9px 7px;border-radius:12px;text-align:center;font-size:9px;color:#68738a;border:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.18)}\n.steps .on{color:var(--white);border-color:rgba(105,231,255,.42);background:rgba(105,231,255,.08)}\n.steps .done{color:var(--mint)}\nlabel{display:block;color:#8994aa;font-size:9px;letter-spacing:.15em;text-transform:uppercase;margin:0 0 8px}\ninput{\n  width:100%;height:54px;border-radius:15px;padding:0 16px;color:var(--white);\n  background:rgba(1,4,12,.62);border:1px solid rgba(255,255,255,.1);outline:none;font:inherit;font-size:13px;\n  box-shadow:inset 0 5px 15px rgba(0,0,0,.25)\n}\ninput:focus{border-color:rgba(105,231,255,.55);box-shadow:0 0 0 4px rgba(105,231,255,.06),0 0 30px rgba(105,231,255,.08)}\nbutton{\n  min-height:51px;border:0;border-radius:15px;padding:0 20px;margin-top:14px;cursor:pointer;\n  color:#031014;font:inherit;font-weight:800;background:linear-gradient(110deg,var(--mint),var(--cyan));\n  box-shadow:0 7px 0 #237e7a,0 17px 35px rgba(105,231,255,.18),inset 0 1px 0 white;\n  transition:.18s ease\n}\nbutton:hover{transform:translateY(-3px);filter:brightness(1.07)}\nbutton:active{transform:translateY(4px);box-shadow:0 3px 0 #237e7a}\nbutton.sec{background:rgba(255,255,255,.055);color:#b5bfd2;border:1px solid rgba(255,255,255,.12);box-shadow:0 5px 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)}\nbutton.tiny{min-height:39px;padding:0 12px;font-size:10px}\n.msg{padding:11px 13px;border-radius:13px;font-size:11px;margin:14px 0;display:none}\n.msg.err{display:block;background:rgba(255,82,105,.08);border:1px solid rgba(255,82,105,.25);color:#ff8d9d}\n.msg.ok{display:block;background:rgba(138,255,209,.07);border:1px solid rgba(138,255,209,.22);color:var(--mint)}\n.hide{display:none!important}\n\n/* STATS / VISUAL */\n.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.stat{\n  min-height:145px;padding:20px;border-radius:22px;border:1px solid rgba(255,255,255,.1);\n  background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.018));display:flex;flex-direction:column;justify-content:space-between\n}\n.stat small{color:#78839a;font-size:9px;letter-spacing:.15em}\n.stat strong{font-size:38px;letter-spacing:-.07em}\n.stat:first-child strong{color:var(--mint);text-shadow:0 0 25px rgba(138,255,209,.18)}\n.visual{\n  margin-top:12px;height:145px;border-radius:22px;position:relative;overflow:hidden;\n  background:radial-gradient(circle at 50% 50%,rgba(105,231,255,.13),transparent 43%),rgba(0,0,0,.18);\n  border:1px solid rgba(255,255,255,.08)\n}\n.orb{position:absolute;width:74px;height:74px;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%);\n  background:radial-gradient(circle at 32% 28%,#fff, var(--cyan) 15%,var(--violet) 45%,rgba(169,140,255,.05) 70%);\n  box-shadow:0 0 35px rgba(105,231,255,.38),0 0 90px rgba(169,140,255,.18);animation:orb 4s ease-in-out infinite}\n.ring{position:absolute;left:50%;top:50%;width:120px;height:50px;border:1px solid rgba(105,231,255,.4);border-radius:50%;transform:translate(-50%,-50%) rotate(-18deg);animation:ring 5s linear infinite}\n\n/* RESULT */\n.kv{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px}\n.kv b{font-weight:500;color:#7e899f}.kv span{text-align:right;word-break:break-all;max-width:70%}\n.tok{padding:13px;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.09);font-size:10px;word-break:break-all;color:#aeb8ca;max-height:100px;overflow:auto}\n.contact{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px}\n.contact a{padding:18px;border-radius:21px;text-decoration:none;color:var(--white);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);transition:.2s}\n.contact a:hover{transform:translateY(-4px);border-color:rgba(105,231,255,.3);background:rgba(105,231,255,.06)}\n.contact b{display:block;font-size:12px}.contact small{color:#7f899f;font-size:9px}\n\n.tempmail-card{margin-top:18px}\n.temp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}\n.temp-badge{display:inline-flex;padding:6px 9px;border-radius:99px;font-size:8px;letter-spacing:.14em;color:var(--mint);border:1px solid rgba(138,255,209,.2);background:rgba(138,255,209,.05);margin-bottom:7px}\n.temp-head h2{margin:0 0 5px}.temp-actions-top{display:flex;gap:8px}.temp-actions-top button{margin-top:0}\n.tm-row{display:grid;grid-template-columns:170px 1fr auto;gap:9px;align-items:center}\n.tm-row select{height:54px;border-radius:15px;padding:0 12px;color:var(--white);background:rgba(1,4,12,.62);border:1px solid rgba(255,255,255,.1);font:inherit;font-size:12px;outline:none}\n.tm-row input{min-width:0}.tm-row button{margin-top:0;white-space:nowrap}\n#tm-generate{margin-top:14px}.tm-list{margin-top:14px;display:grid;gap:9px}.tm-empty{padding:20px;border:1px dashed rgba(255,255,255,.1);border-radius:16px;text-align:center;color:#69748b;font-size:11px}\n.tm-item{border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18);border-radius:16px;padding:14px;cursor:pointer}.tm-item:hover{border-color:rgba(105,231,255,.25)}\n.tm-meta{display:flex;justify-content:space-between;gap:12px}.tm-subject{font-size:12px;font-weight:800}.tm-from,.tm-date{font-size:9px;color:#778298;margin-top:5px}.tm-body{display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);color:#b8c1d1;font-size:11px;line-height:1.65;word-break:break-word}.tm-item.open .tm-body{display:block}.tm-links{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.tm-link{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:#031014;background:linear-gradient(110deg,var(--mint),var(--cyan));padding:9px 11px;border-radius:11px;font-size:9px;font-weight:900}.tm-link.sec{color:#b9c3d5;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}\n@media(max-width:700px){.temp-head{flex-direction:column}.temp-actions-top{width:100%}.temp-actions-top button{flex:1}.tm-row{grid-template-columns:1fr}.tm-row button{width:100%}}\n\nfooter{text-align:center;color:#596378;font-size:9px;margin-top:25px}\n@keyframes spin{to{transform:rotate(360deg)}}\n@keyframes orb{50%{transform:translate(-50%,-58%) scale(1.08)}}\n@keyframes ring{to{transform:translate(-50%,-50%) rotate(342deg)}}\n@media(max-width:900px){\n .dashboard{grid-template-columns:1fr}.hero{min-height:320px}\n}\n@media(max-width:560px){\n .shell{width:calc(100% - 18px);padding-top:10px}.hero{padding:25px 20px;min-height:330px;border-radius:28px}\n .badge{display:none}.hero h1{font-size:43px}.hero p{font-size:12px}\n .nav{margin:-22px 12px 18px;gap:6px}.nav a{font-size:9px;padding:11px 5px}\n .card{padding:20px;border-radius:22px}.stats{grid-template-columns:1fr 1fr}.stat{min-height:125px}.stat strong{font-size:29px}\n .contact{grid-template-columns:1fr}.steps div{font-size:8px}\n button{width:100%}.panel{display:block}\n}\n@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}\n</style>\n\n<style id=\"clean-ultra\">\n:root{\n  --bg:#05070d;--panel:rgba(12,16,27,.72);--line:rgba(255,255,255,.09);\n  --cyan:#69e7ff;--mint:#72f3c7;--pink:#ff72c8;--text:#f5f8ff;--muted:#8994aa;\n}\n*{box-sizing:border-box}\nhtml,body{min-height:100%;background:#05070d}\nbody{\n  margin:0;color:var(--text);overflow-x:hidden;\n  background:\n    radial-gradient(circle at 15% 10%,rgba(105,231,255,.11),transparent 27%),\n    radial-gradient(circle at 88% 22%,rgba(255,114,200,.09),transparent 25%),\n    linear-gradient(180deg,rgba(3,5,11,.78),#05070d 65%);\n}\nbody:before{\n  content:\"\";position:fixed;inset:0;z-index:-3;\n  background:url(\"https://u.pone.rs/vtadimdj.png\") center/cover fixed no-repeat;\n  opacity:.26;filter:saturate(.85) contrast(1.05);\n}\nbody:after{\n  content:\"\";position:fixed;inset:0;z-index:-2;pointer-events:none;\n  background:linear-gradient(180deg,rgba(2,4,10,.38),rgba(2,4,10,.9));\n}\n.shell{width:min(1160px,calc(100% - 32px));margin:auto;padding:24px 0 38px}\n.nav{\n  height:58px;padding:0 18px;border:1px solid var(--line);border-radius:18px;\n  background:rgba(7,10,18,.64);backdrop-filter:blur(22px);\n  display:flex;align-items:center;justify-content:space-between;\n  box-shadow:0 15px 50px rgba(0,0,0,.25)\n}\n.nav a{color:#dfe7f5;text-decoration:none;font-weight:700;font-size:13px}\n.nav .brand{display:flex;align-items:center;gap:10px}\n.nav .brand:before{\n  content:\"\";width:9px;height:9px;border-radius:50%;background:var(--cyan);\n  box-shadow:0 0 16px var(--cyan)\n}\n.hero{\n  min-height:400px;margin-top:18px;padding:58px 52px;position:relative;overflow:hidden;\n  border:1px solid var(--line);border-radius:32px;\n  background:linear-gradient(135deg,rgba(14,19,32,.82),rgba(7,10,18,.58));\n  box-shadow:0 35px 100px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.07)\n}\n.hero:before{\n  content:\"\";position:absolute;width:430px;height:430px;right:-100px;top:-160px;\n  border-radius:50%;border:1px solid rgba(105,231,255,.13);\n  box-shadow:0 0 90px rgba(105,231,255,.06),inset 0 0 80px rgba(105,231,255,.035)\n}\n.hero:after{\n  content:\"\";position:absolute;width:300px;height:300px;right:10px;top:-95px;\n  border-radius:50%;border:1px solid rgba(255,114,200,.09)\n}\n.hero-content{position:relative;z-index:2;max-width:720px}\n.eyebrow{\n  display:inline-flex;align-items:center;padding:7px 11px;border-radius:99px;\n  border:1px solid rgba(105,231,255,.15);background:rgba(105,231,255,.05);\n  color:#9ceeff;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase\n}\n.hero h1{font-size:clamp(46px,7vw,86px);line-height:.91;letter-spacing:-.065em;margin:22px 0 17px}\n.hero h1 em{font-style:normal;background:linear-gradient(100deg,#fff 10%,#9defff 48%,#c59bff 90%);\n  -webkit-background-clip:text;background-clip:text;color:transparent}\n.hero p{max-width:610px;color:#9ca8bc;font-size:16px;line-height:1.7;margin:0}\n.hero-badges{display:flex;gap:9px;flex-wrap:wrap;margin-top:26px}\n.hero-badges span{\n  padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.035);\n  color:#cbd5e5;font-size:11px;font-weight:700\n}\n.dashboard{\n  display:grid;grid-template-columns:minmax(0,1.35fr) minmax(290px,.65fr);\n  gap:18px;margin-top:18px;align-items:stretch\n}\n.card,#contact{\n  position:relative;border:1px solid var(--line);border-radius:25px;\n  background:rgba(10,14,24,.76);backdrop-filter:blur(22px);\n  box-shadow:0 25px 70px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.055);\n}\n.card{padding:25px}\n.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}\n.card-title{font-size:18px;font-weight:850}\n.card-sub{font-size:12px;color:var(--muted);margin-top:5px}\n.steps{\n  display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:5px;\n  border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:15px;margin-bottom:22px\n}\n.steps div{\n  padding:11px 8px;text-align:center;border-radius:10px;color:#68748a;font-size:11px;font-weight:800\n}\n.steps div.on{background:rgba(105,231,255,.08);color:#bff5ff;box-shadow:inset 0 0 0 1px rgba(105,231,255,.1)}\nlabel{display:block;color:#9da9bd;font-size:11px;font-weight:800;margin:0 0 8px;text-transform:uppercase;letter-spacing:.08em}\ninput{\n  width:100%;height:50px;padding:0 15px;border-radius:13px;border:1px solid var(--line);\n  background:rgba(3,6,12,.72);color:white;outline:none;font-size:14px\n}\ninput:focus{border-color:rgba(105,231,255,.45);box-shadow:0 0 0 4px rgba(105,231,255,.055)}\nbutton{\n  min-height:49px;padding:0 17px;border:0;border-radius:13px;cursor:pointer;\n  color:#061017;background:linear-gradient(135deg,#8df1ff,#72f3c7);\n  font-weight:900;letter-spacing:.01em;box-shadow:0 12px 28px rgba(105,231,255,.12)\n}\nbutton:hover{filter:brightness(1.06);transform:translateY(-1px)}\nbutton:active{transform:translateY(0)}\n.form-row{display:grid;grid-template-columns:1fr auto;gap:9px}\n.msg{min-height:18px;margin-top:10px;color:#8996aa;font-size:12px}\n.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.stat{\n  padding:17px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.025)\n}\n.stat small{display:block;color:#78849a;font-size:10px;text-transform:uppercase;letter-spacing:.09em;font-weight:800}\n.stat strong{display:block;font-size:28px;line-height:1;margin-top:9px}\n.visual{\n  min-height:260px;margin-top:12px;border-radius:21px;position:relative;overflow:hidden;\n  display:grid;place-items:center;border:1px solid var(--line);\n  background:\n    radial-gradient(circle at center,rgba(105,231,255,.11),transparent 35%),\n    linear-gradient(145deg,rgba(105,231,255,.025),rgba(255,114,200,.025))\n}\n.visual .orb{\n  width:94px;height:94px;border-radius:50%;\n  background:radial-gradient(circle at 34% 28%,#e8fdff 0 4%,#69e7ff 12%,#536eff 48%,#17172e 72%);\n  box-shadow:0 0 30px rgba(105,231,255,.3),0 0 100px rgba(105,231,255,.12);\n  animation:orb 4.5s ease-in-out infinite\n}\n.visual .ring{\n  position:absolute;width:170px;height:65px;border:1px solid rgba(105,231,255,.23);\n  border-radius:50%;transform:rotate(-18deg);animation:spin 12s linear infinite\n}\n.visual .ring:after{\n  content:\"\";position:absolute;width:7px;height:7px;border-radius:50%;background:var(--cyan);\n  box-shadow:0 0 15px var(--cyan);left:11px;top:3px\n}\n.contact{margin-top:18px;padding:22px;display:flex;align-items:center;justify-content:space-between;gap:20px}\n.contact-links{display:flex;gap:9px;flex-wrap:wrap}\n.contact a{\n  text-decoration:none;color:#dfe7f5;border:1px solid var(--line);padding:10px 13px;border-radius:12px;\n  background:rgba(255,255,255,.025);font-size:12px;font-weight:800\n}\nfooter{text-align:center;color:#58657b;font-size:11px;padding:22px 0 5px}\n#p2,#p3{animation:panelIn .4s ease both}\n@keyframes panelIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}\n@keyframes orb{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.035)}}\n@keyframes spin{to{transform:rotate(342deg)}}\n@media(max-width:850px){\n  .dashboard{grid-template-columns:1fr}\n  .hero{padding:46px 30px}\n}\n@media(max-width:560px){\n  .shell{width:min(100% - 18px,1160px);padding-top:9px}\n  .nav{height:52px}\n  .hero{min-height:370px;padding:36px 21px;border-radius:24px}\n  .hero h1{font-size:48px}\n  .hero p{font-size:14px}\n  .card{padding:18px;border-radius:21px}\n  .form-row{grid-template-columns:1fr}\n  .stats{grid-template-columns:1fr 1fr}\n  .contact{align-items:flex-start;flex-direction:column}\n}\n</style>\n\n</head>\n<body>\n<div class=\"shell\">\n\n  <section class=\"hero\">\n    <div class=\"badge\">SECURE • LOGIN</div>\n    <div class=\"hero-content\">\n      <div class=\"eyebrow\">VINZ OFFICIALL / LOGIN SYSTEM</div>\n      <h1>AM <em>Magic Link</em><br>Login.</h1>\n      <p>Login akun melalui magic link dengan interface futuristik. Masukkan email, buka link verifikasi dari email, lalu lihat detail akun.</p>\n    </div>\n  </section>\n\n  <nav class=\"nav\">\n    <a href=\"#activate\">LOGIN</a>\n    <a href=\"#stats\">STATISTICS</a>\n    <a href=\"#contact\">CONTACT</a>\n  </nav>\n\n  <main class=\"dashboard\" id=\"activate\">\n\n    <section class=\"card\">\n      <div class=\"steps\">\n        <div id=\"n1\" class=\"on\">01 · EMAIL</div>\n        <div id=\"n2\">02 · LINK</div>\n        <div id=\"n3\">03 · DONE</div>\n      </div>\n\n      <div class=\"panel\" id=\"p1\" style=\"padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none\">\n        <h2>Start login</h2>\n        <p class=\"sub\">Magic link akan dikirim ke email kamu. Tidak perlu memasukkan password.</p>\n        <label>Email address</label>\n        <input id=\"em\" type=\"email\" placeholder=\"nama@email.com\" autocomplete=\"email\">\n        <button id=\"b1\">SEND LINK →</button>\n        <div id=\"m1\" class=\"msg\"></div>\n      </div>\n\n      <div class=\"panel hide\" id=\"p2\" style=\"padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none\">\n        <h2>Verify your link</h2>\n        <p class=\"sub\">Link dikirim ke <span id=\"w-em\">-</span>. Copy link dari email lalu paste di bawah.</p>\n        <label>Verification link</label>\n        <input id=\"lk\" type=\"text\" placeholder=\"https://... atau oobCode\">\n        <button id=\"b2\" class=\"sec\">← BACK</button>\n        <button id=\"b3\">VERIFY LOGIN →</button>\n        <div id=\"m2\" class=\"msg\"></div>\n      </div>\n\n      <div class=\"panel hide\" id=\"p3\" style=\"padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none\">\n        <h2 style=\"color:var(--mint)\">Login complete ✓</h2>\n        <p class=\"sub\">Detail akun berhasil diterima. ID token dapat dicopy.</p>\n        <div class=\"kv\"><b>EMAIL</b><span id=\"r-em\">-</span></div>\n        <div class=\"kv\"><b>UID</b><span id=\"r-uid\">-</span></div>\n        <div class=\"kv\"><b>STATUS</b><span id=\"r-ord\">LOGIN_ONLY</span></div>\n        <label style=\"margin-top:18px\">ID TOKEN</label>\n        <div class=\"tok\" id=\"r-tok\">-</div>\n        <button class=\"tiny sec\" id=\"b4\">COPY TOKEN</button>\n        <button class=\"tiny sec\" id=\"b5\">NEW ACTIVATION</button>\n      </div>\n    </section>\n\n    <aside class=\"card\" id=\"stats\">\n      <h2>Live activity</h2>\n      <p class=\"sub\">Login counter dari endpoint statistik.</p>\n      <div class=\"stats\">\n        <div class=\"stat\"><small>TOTAL LOGINS</small><strong id=\"st-total\">-</strong></div>\n        <div class=\"stat\"><small>TODAY</small><strong id=\"st-today\">-</strong></div>\n      </div>\n      <div class=\"visual\"><div class=\"ring\"></div><div class=\"orb\"></div></div>\n    </aside>\n\n  </main>\n\n  <section class=\"card tempmail-card\" id=\"tempmail\" style=\"margin-top:18px\">\n    <div class=\"temp-head\">\n      <div>\n        <div class=\"temp-badge\">IN-APP INBOX</div>\n        <h2>Temp Mail</h2>\n        <p class=\"sub\">Buat mailbox sementara langsung dari halaman ini. Inbox diperbarui otomatis tanpa reload.</p>\n      </div>\n      <div class=\"temp-actions-top\">\n        <button class=\"tiny sec\" id=\"tm-refresh\">REFRESH INBOX</button>\n        <button class=\"tiny sec\" id=\"tm-delete\">DELETE</button>\n      </div>\n    </div>\n    <div class=\"tm-row\">\n      <select id=\"tm-domain\" aria-label=\"Temp mail domain\">\n        <option value=\"catchmail.io\">@catchmail.io</option>\n        <option value=\"mailistry.com\">@mailistry.com</option>\n        <option value=\"zeppost.com\">@zeppost.com</option>\n      </select>\n      <input id=\"tm-email\" type=\"text\" readonly placeholder=\"Belum ada mailbox\">\n      <button class=\"tiny sec\" id=\"tm-copy\">COPY EMAIL</button>\n    </div>\n    <button id=\"tm-generate\">GENERATE MAIL →</button>\n    <div id=\"tm-msg\" class=\"msg\"></div>\n    <div id=\"tm-list\" class=\"tm-list\"><div class=\"tm-empty\">Belum ada email.</div></div>\n    <p class=\"tm-note\">Mailbox disimpan di browser sampai kamu menekan DELETE atau GENERATE MAIL lagi. Inbox diperbarui otomatis.</p>\n  </section>\n\n  <section class=\"card\" id=\"contact\" style=\"margin-top:18px\">\n    <h2>Need assistance?</h2>\n    <p class=\"sub\">Hubungi kami melalui channel yang tersedia.</p>\n    <div class=\"contact\">\n      <a href=\"https://t.me/\" target=\"_blank\" rel=\"noopener\"><b>✈ Telegram</b><small>Open Telegram contact</small></a>\n      <a href=\"https://wa.me/\" target=\"_blank\" rel=\"noopener\"><b>◉ WhatsApp</b><small></small></a>\n    </div>\n  </section>\n\n  <footer>vinzofficiall · magic link login interface</footer>\n</div>\n\n<script>\nconst $ = i => document.getElementById(i)\n\nfetch('/api/stats').then(r => r.json()).then(j => {\n  $('st-total').textContent = Number(j.total || 0).toLocaleString('id-ID')\n  $('st-today').textContent = Number(j.today || 0).toLocaleString('id-ID')\n}).catch(() => {})\n\nconst step = n => {\n  for (let i = 1; i <= 3; i++) {\n    $('p' + i).classList.toggle('hide', i !== n)\n    $('n' + i).className = i < n ? 'done' : (i === n ? 'on' : '')\n  }\n}\nconst say = (id, txt, ok) => {\n  const m = $(id)\n  m.textContent = txt\n  m.className = 'msg ' + (ok ? 'ok' : 'err')\n}\nconst busy = (b, on, t) => { b.disabled = on; if (t) b.textContent = t }\n\n$('b1').onclick = async () => {\n  const em = $('em').value.trim()\n  if (!em.includes('@')) return say('m1', 'email gak valid', 0)\n  const b = $('b1'); busy(b, true, 'mengirim...')\n  try {\n    const r = await fetch('/api/send-link', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email: em }) })\n    const j = await r.json()\n    if (j.success) { say('m1', 'link terkirim, cek email', 1); $('w-em').textContent = em; setTimeout(() => step(2), 700) }\n    else say('m1', j.message || 'gagal', 0)\n  } catch { say('m1', 'server gak nyambung', 0) }\n  busy(b, false); b.textContent = 'kirim link \\u2192'\n}\n\n$('b2').onclick = () => step(1)\n\n$('b3').onclick = async () => {\n  const raw = $('lk').value.trim()\n  if (!raw) return say('m2', 'link kosong', 0)\n  const b = $('b3'); busy(b, true, 'verifikasi...')\n  try {\n    const r = await fetch('/api/verify-link', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email: $('w-em').textContent, magicLink: raw }) })\n    const j = await r.json()\n    if (j.success) {\n      const d = j.data\n      $('r-em').textContent = d.email\n      $('r-uid').textContent = d.uid\n      $('r-ord').textContent = d.orderId || '-'\n      $('r-tok').textContent = d.idToken\n      window.__tok = d.idToken\n      step(3)\n    } else say('m2', j.message || 'gagal', 0)\n  } catch { say('m2', 'server gak nyambung', 0) }\n  busy(b, false); b.textContent = 'verifikasi \\u2192'\n}\n\n$('b4').onclick = () => { navigator.clipboard.writeText(window.__tok || ''); $('b4').textContent = 'copied' }\n$('b5').onclick = () => { $('lk').value = ''; step(1) }\n</script>\n\n<script>\n(() => {\n  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;\n  if (reduce || !matchMedia('(pointer:fine)').matches) return;\n  document.querySelectorAll('.hero,.dashboard > .card').forEach(el=>{\n    el.addEventListener('pointermove',e=>{\n      const r=el.getBoundingClientRect(),x=e.clientX/r.width-(r.left/r.width)-.5,y=e.clientY/r.height-(r.top/r.height)-.5;\n      el.style.transform=`perspective(1100px) rotateX(${(-y*1.4).toFixed(2)}deg) rotateY(${(x*1.4).toFixed(2)}deg)`;\n    });\n    el.addEventListener('pointerleave',()=>el.style.transform='');\n  });\n})();\n</script>\n\n\n<script>\n(() => {\n  const tm = id => document.getElementById(id)\n  const STORAGE = 'vinz_catchmail_mailbox_v2'\n  const CATCHMAIL = 'https://api.catchmail.io/api/v1'\n  const DOMAINS = ['catchmail.io','mailistry.com','zeppost.com']\n  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))\n  const sayTm = (txt, ok=false) => { const m=tm('tm-msg'); m.textContent=txt; m.className='msg '+(ok?'ok':'err') }\n  const setBusy = (b,on,t) => { b.disabled=on; if(t) b.textContent=t }\n  const getBox = () => { try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null} }\n  const saveBox = box => localStorage.setItem(STORAGE, JSON.stringify(box))\n  const clearBox = () => {\n    localStorage.removeItem(STORAGE)\n    tm('tm-email').value=''\n    tm('tm-list').innerHTML='<div class=\"tm-empty\">Belum ada email.</div>'\n    sayTm('Mailbox dihapus.',true)\n  }\n\n  async function readJsonResponse(r){\n    const text=await r.text()\n    let j=null\n    try{j=JSON.parse(text)}catch{\n      const snippet=String(text||'').replace(/\\s+/g,' ').slice(0,100)\n      throw new Error(`Server bukan JSON${r.status?` (HTTP ${r.status})`:''}${snippet?`: ${snippet}`:''}`)\n    }\n    if(!r.ok || j.success===false) throw new Error(j.message || j.error?.message || `Request gagal (HTTP ${r.status})`)\n    return j\n  }\n\n  async function localApi(url,opt){\n    const r=await fetch(url,opt)\n    return readJsonResponse(r)\n  }\n\n  function randomMailbox(domain){\n    const local='vinz'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)\n    return `${local}@${DOMAINS.includes(domain)?domain:'catchmail.io'}`\n  }\n\n  async function catchmail(path){\n    const r=await fetch(CATCHMAIL+path,{headers:{Accept:'application/json'}})\n    const text=await r.text(); let j=null\n    try{j=JSON.parse(text)}catch{throw new Error(`Catchmail bukan JSON (HTTP ${r.status})`)}\n    if(!r.ok) throw new Error(j?.error?.message || j?.message || `Catchmail HTTP ${r.status}`)\n    return j\n  }\n\n  async function generate(){\n    const b=tm('tm-generate'); const domain=tm('tm-domain').value\n    setBusy(b,true,'GENERATING...'); sayTm('Membuat mailbox...',true)\n    try{\n      let email=''\n      try{\n        const j=await localApi('/api/tempmail/generate?domain='+encodeURIComponent(domain))\n        email=j.email\n      }catch(_){\n        // Fallback for static hosting: Catchmail uses any address; no create call is required.\n        email=randomMailbox(domain)\n      }\n      if(!email) throw new Error('Gagal membuat alamat mailbox.')\n      const box={email,domain,createdAt:Date.now()}\n      saveBox(box)\n      tm('tm-email').value=box.email\n      tm('tm-list').innerHTML='<div class=\"tm-empty\">Mailbox aktif. Menunggu email...</div>'\n      sayTm('Mailbox berhasil dibuat.',true)\n      await refresh()\n    }catch(e){sayTm(e.message||'Gagal membuat mailbox.')}\n    setBusy(b,false,'GENERATE MAIL →')\n  }\n\n  async function getInbox(email){\n    try{\n      const j=await localApi('/api/tempmail/inbox?email='+encodeURIComponent(email))\n      return j.data\n    }catch(_){\n      return await catchmail('/mailbox?address='+encodeURIComponent(email)+'&page=1&page_size=50')\n    }\n  }\n\n  async function getMessage(id,email){\n    try{\n      const j=await localApi('/api/tempmail/message?id='+encodeURIComponent(id)+'&email='+encodeURIComponent(email))\n      return j.data\n    }catch(_){\n      return await catchmail('/message/'+encodeURIComponent(id)+'?mailbox='+encodeURIComponent(email))\n    }\n  }\n\n  async function refresh(){\n    const box=getBox(); if(!box?.email)return\n    tm('tm-email').value=box.email\n    try{ renderInbox(await getInbox(box.email)) }\n    catch(e){sayTm(e.message||'Gagal membaca inbox.')}\n  }\n\n  function renderInbox(data){\n    const list=Array.isArray(data?.messages)?data.messages:[]\n    if(!list.length){tm('tm-list').innerHTML='<div class=\"tm-empty\">Belum ada email.</div>';return}\n    tm('tm-list').innerHTML=list.map(m=>`<article class=\"tm-item\" data-id=\"${esc(m.id)}\"><div class=\"tm-meta\"><div><div class=\"tm-subject\">${esc(m.subject||'(tanpa subject)')}</div><div class=\"tm-from\">${esc(m.from||'-')}</div></div><div class=\"tm-date\">${esc(m.date||'')}</div></div><div class=\"tm-body\"><div class=\"tm-loading\">Memuat isi email...</div></div></article>`).join('')\n    tm('tm-list').querySelectorAll('.tm-item').forEach(el=>el.addEventListener('click',()=>openMessage(el)))\n  }\n\n  function extractLinks(html,text){\n    const out=[]; const seen=new Set()\n    const add=u=>{try{u=decodeURIComponent(String(u).replace(/&amp;/g,'&')); const x=new URL(u); if(!/^https?:$/.test(x.protocol))return; if(!seen.has(x.href)){seen.add(x.href);out.push(x.href)}}catch{}}\n    const h=String(html||'')\n    const hrefs=[...h.matchAll(/href\\s*=\\s*[\"']([^\"']+)[\"']/gi)].map(m=>m[1])\n    const urls=[...(h+'\\n'+String(text||'')).matchAll(/https?:\\/\\/[^\\s<>\"']+/gi)].map(m=>m[0].replace(/[),.;]+$/,''))\n    ;[...hrefs,...urls].forEach(add)\n    return out\n  }\n\n  const htmlToText = h => { const d=document.createElement('div'); d.innerHTML=String(h||''); return d.textContent||d.innerText||'' }\n\n  async function openMessage(el){\n    if(el.classList.contains('open')){el.classList.remove('open');return}\n    const box=getBox(); if(!box?.email)return\n    el.classList.add('open')\n    const body=el.querySelector('.tm-body')\n    try{\n      const d=await getMessage(el.dataset.id,box.email)\n      const html=d.body?.html||''\n      const text=d.body?.text || htmlToText(html)\n      const urls=extractLinks(html,text)\n      const am=urls.filter(u=>u.includes('alight-creative.firebaseapp.com'))\n      const ordered=[...am,...urls.filter(u=>!am.includes(u))]\n      const unique=[...new Set(ordered)]\n      body.innerHTML=`<div>${esc(text).replace(/\\n/g,'<br>')}</div>${unique.length?'<div class=\"tm-links\">'+unique.map((u,i)=>`<div class=\"tm-link-row\"><a class=\"tm-link\" href=\"${esc(u)}\" target=\"_blank\" rel=\"noopener\">${i===0&&u.includes('alight-creative.firebaseapp.com')?'OPEN AM LINK':'OPEN LINK'}</a><button type=\"button\" class=\"tm-link sec tm-copy-link\" data-url=\"${esc(u)}\">COPY LINK</button></div>`).join('')+'</div>':''}`\n      body.querySelectorAll('.tm-copy-link').forEach(btn=>btn.addEventListener('click',async e=>{\n        e.stopPropagation(); const value=btn.dataset.url\n        try{await navigator.clipboard.writeText(value)}catch{const x=document.createElement('textarea');x.value=value;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove()}\n        btn.textContent='COPIED'; setTimeout(()=>btn.textContent='COPY LINK',1200)\n      }))\n    }catch(e){body.innerHTML='<div>'+esc(e.message||'Gagal membaca email.')+'</div>'}\n  }\n\n  tm('tm-generate').addEventListener('click',generate)\n  tm('tm-refresh').addEventListener('click',refresh)\n  tm('tm-delete').addEventListener('click',clearBox)\n  tm('tm-copy').onclick=async()=>{\n    const e=tm('tm-email').value;if(!e)return\n    try{await navigator.clipboard.writeText(e)}catch{const x=document.createElement('textarea');x.value=e;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove()}\n    tm('tm-copy').textContent='COPIED';setTimeout(()=>tm('tm-copy').textContent='COPY EMAIL',1200)\n  }\n\n  const old=getBox()\n  if(old){tm('tm-domain').value=old.domain||'catchmail.io';tm('tm-email').value=old.email;refresh()}\n  // Catchmail documents a public rate limit of 1 request/sec/IP; poll every 6 seconds.\n  setInterval(()=>{if(document.visibilityState==='visible'&&getBox())refresh()},6000)\n})()\n</script>\n\n</body>\n</html>\n";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extra
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function validEmail(v) {
  return typeof v === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function randomMailbox(domain) {
  const d = DOMAINS.includes(domain) ? domain : "catchmail.io";
  const local = "vinz" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${local.toLowerCase()}@${d}`;
}

function friendlyFirebaseError(raw) {
  const s = String(raw || "");
  if (s.includes("INVALID_OOB_CODE")) return "Kode magic link tidak valid atau sudah pernah digunakan.";
  if (s.includes("EXPIRED_OOB_CODE")) return "Magic link telah kadaluarsa. Kirim ulang tautan baru.";
  if (s.includes("INVALID_EMAIL")) return "Format email tidak valid.";
  if (s.includes("EMAIL_NOT_FOUND")) return "Email tidak ditemukan.";
  if (s.includes("USER_DISABLED")) return "Akun dinonaktifkan.";
  if (s.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) return "Terlalu banyak percobaan. Coba lagi nanti.";
  if (s.includes("API_KEY_INVALID") || s.includes("API key not valid")) return "FIREBASE_API_KEY tidak valid.";
  return s.length > 500 ? s.slice(0, 500) : (s || "Terjadi kesalahan autentikasi.");
}

function extractOobCode(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replaceAll("&amp;", "&");
  try { s = decodeURIComponent(s); } catch {}

  try {
    const u = new URL(s);
    let code = u.searchParams.get("oobCode");
    if (!code) {
      const nested = u.searchParams.get("link") ||
                     u.searchParams.get("q") ||
                     u.searchParams.get("url");
      if (nested) {
        try { code = new URL(nested).searchParams.get("oobCode"); } catch {}
      }
    }
    if (code) return code.replace(/[^a-zA-Z0-9_-]/g, "");
  } catch {}

  const m = s.match(/oobCode=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes("://")) return s;
  return null;
}

async function firebasePost(path, payload, env) {
  const key = FALLBACK_FIREBASE_API_KEY;
  const response = await fetch(`${FIREBASE_ENDPOINT}/${path}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}

  if (!response.ok) {
    const message = data?.error?.message || text || `Firebase HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function sendMagicLink(email, env) {
  try {
    await firebasePost("getOobConfirmationCode", {
      requestType: 6,
      email,
      androidInstallApp: true,
      canHandleCodeInApp: true,
      continueUrl: "https://alightcreative.com?ui_sid=0366624874&ui_sd=0",
      iosBundleId: "com.alightcreative.motion",
      androidPackageName: "com.alightcreative.motion",
      androidMinimumVersion: "585",
      clientType: "CLIENT_TYPE_ANDROID"
    }, env);
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

async function verifyMagicLink(email, rawLink, env) {
  const code = extractOobCode(rawLink);
  if (!code) return { ok: false, why: "Gagal mengekstrak oobCode dari magic link." };

  try {
    const signin = await firebasePost("emailLinkSignin", {
      email,
      oobCode: code,
      clientType: "CLIENT_TYPE_ANDROID"
    }, env);

    let user = null;
    try {
      const info = await firebasePost("getAccountInfo", {
        idToken: signin.idToken
      }, env);
      user = info?.users?.[0] || null;
    } catch {}

    return {
      ok: true,
      id: signin.idToken,
      ref: signin.refreshToken,
      uid: signin.localId,
      baru: !!signin.isNewUser,
      user
    };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

async function refreshStats(env) {
  const today = new Date().toISOString().slice(0, 10);

  if (env.STATS) {
    let data;
    try {
      data = JSON.parse(await env.STATS.get("stats") || "null");
    } catch {
      data = null;
    }

    if (!data || data.date !== today) {
      data = { total: data?.total || 0, today: 0, date: today };
      await env.STATS.put("stats", JSON.stringify(data));
    }
    return data;
  }

  if (memoryStats.date !== today) {
    memoryStats.today = 0;
    memoryStats.date = today;
  }
  return memoryStats;
}

async function getStats(env) {
  return refreshStats(env);
}

async function incrementStats(env) {
  const current = await refreshStats(env);
  const next = {
    total: Number(current.total || 0) + 1,
    today: Number(current.today || 0) + 1,
    date: new Date().toISOString().slice(0, 10)
  };

  if (env.STATS) {
    await env.STATS.put("stats", JSON.stringify(next));
  } else {
    memoryStats = next;
  }
  return next;
}

async function catchmailRequest(method, path, params) {
  const url = new URL(CATCHMAIL_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: { "accept": "application/json", "user-agent": "Vinz-TempMail/1.1" }
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    const err = new Error(`Catchmail mengembalikan response bukan JSON (HTTP ${response.status}).`);
    err.status = response.status;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(data?.error?.message || data?.message || `Catchmail HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/status" && method === "GET") {
    return json({ status: "online", runtime: "cloudflare-workers", timestamp: new Date().toISOString() });
  }

  if (path === "/api/stats" && method === "GET") {
    const stats = await getStats(env);
    return json({
      success: true,
      total: Number(stats.total || 0),
      today: Number(stats.today || 0),
      timestamp: new Date().toISOString()
    });
  }

  if (path === "/api/send-link" && method === "POST") {
    const { email } = await bodyJson(request);
    if (!validEmail(email)) {
      return json({ success: false, message: "email gak valid." }, 400);
    }

    const em = email.trim().toLowerCase();
    const result = await sendMagicLink(em, env);
    if (!result.ok) {
      return json({
        success: false,
        message: friendlyFirebaseError(result.why),
        code: result.why
      }, 400);
    }

    return json({
      success: true,
      email: em,
      message: `link dikirim ke ${em}. cek inbox / spam.`
    });
  }

  if (path === "/api/verify-link" && method === "POST") {
    const { email, magicLink } = await bodyJson(request);
    if (!validEmail(email)) {
      return json({ success: false, message: "email wajib diisi." }, 400);
    }
    if (!magicLink || !String(magicLink).trim()) {
      return json({ success: false, message: "link dari email wajib diisi." }, 400);
    }

    const em = email.trim().toLowerCase();
    const result = await verifyMagicLink(em, String(magicLink).trim(), env);

    if (!result.ok) {
      return json({
        success: false,
        message: friendlyFirebaseError(result.why),
        code: result.why
      }, 400);
    }

    const stats = await incrementStats(env);
    const now = new Date();

    return json({
      success: true,
      message: "login berhasil.",
      data: {
        stats,
        uid: result.uid,
        email: result.user?.email || em,
        emailVerified: result.user?.emailVerified ?? true,
        displayName: result.user?.displayName || null,
        photoUrl: result.user?.photoUrl || null,
        createdAt: result.user?.createdAt
          ? new Date(Number(result.user.createdAt)).toISOString()
          : null,
        lastLoginAt: result.user?.lastLoginAt
          ? new Date(Number(result.user.lastLoginAt)).toISOString()
          : now.toISOString(),
        isNewUser: result.baru,
        status: "ACTIVE",
        membershipStatus: "LOGIN_ONLY",
        planName: "Firebase Email Link Login",
        tokenType: "Bearer",
        idToken: result.id,
        refreshToken: result.ref,
        profile: result.user || null
      }
    });
  }

  if (path === "/api/tempmail/generate" && method === "GET") {
    const domain = DOMAINS.includes(url.searchParams.get("domain"))
      ? url.searchParams.get("domain")
      : "catchmail.io";
    return json({
      success: true,
      email: randomMailbox(domain),
      domain,
      domains: DOMAINS
    });
  }

  if (path === "/api/tempmail/inbox" && method === "GET") {
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!validEmail(email)) {
      return json({ success: false, message: "Alamat email tidak valid." }, 400);
    }

    try {
      const data = await catchmailRequest("GET", "/mailbox", {
        address: email,
        page: 1,
        page_size: 50
      });
      return json({ success: true, data });
    } catch (e) {
      return json({
        success: false,
        message: e.message || "Catchmail tidak dapat dihubungi."
      }, e.status || 502);
    }
  }

  if (path === "/api/tempmail/message" && method === "GET") {
    const id = (url.searchParams.get("id") || "").trim();
    const mailbox = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!id || !validEmail(mailbox)) {
      return json({ success: false, message: "ID pesan atau mailbox tidak valid." }, 400);
    }

    try {
      const data = await catchmailRequest(
        "GET",
        `/message/${encodeURIComponent(id)}`,
        { mailbox }
      );
      return json({ success: true, data });
    } catch (e) {
      return json({
        success: false,
        message: e.message || "Pesan tidak dapat dibaca."
      }, e.status || 502);
    }
  }

  if (path === "/api/tempmail/message" && method === "DELETE") {
    const id = (url.searchParams.get("id") || "").trim();
    const mailbox = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!id || !validEmail(mailbox)) {
      return json({ success: false, message: "ID pesan atau mailbox tidak valid." }, 400);
    }

    try {
      const data = await catchmailRequest(
        "DELETE",
        `/message/${encodeURIComponent(id)}`,
        { mailbox }
      );
      return json({ success: true, data: data || null });
    } catch (e) {
      return json({
        success: false,
        message: e.message || "Pesan gagal dihapus."
      }, e.status || 502);
    }
  }

  return json({ success: false, message: "API endpoint tidak ditemukan." }, 404);
}

async function handle(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, env, url);
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return new Response(INDEX_HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-cache"
      }
    });
  }

  return new Response(INDEX_HTML, {
    headers: { "content-type": "text/html; charset=UTF-8" }
  });
}

async function workerFetch(request) {
  try {
    // Classic Service Worker upload has no module-style `env` parameter.
    // The app therefore runs without KV/secret bindings in this dashboard-upload build.
    return await handle(request, {});
  } catch (error) {
    return json({
      success: false,
      message: error?.message || "Internal Worker error."
    }, 500);
  }
}

addEventListener("fetch", event => {
  event.respondWith(workerFetch(event.request));
});
