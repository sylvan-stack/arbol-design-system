// Mid-tier source from scripts/check-elma-routing.mjs; see MID_TIER.md.
// Shared helpers and refusal entry points remain at the original path.

// TEST-TIER-DISABLED-BEGIN scripts/check-elma-routing.mjs
// import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
// const base=process.env.STORYBOOK_URL||'http://127.0.0.1:6113',server=process.env.STORYBOOK_URL?undefined:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'6113'},stdio:'ignore'});
// if(server)for(let i=0;i<100;i++){try{if((await fetch(base+'/index.json')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
// const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
// async function open(name){await page.goto(base+'/iframe.html?id=sections-elmaframe--'+name+'&viewMode=story');await page.getByRole('heading',{name:/Elma Chat/}).waitFor();}
// try{
//  await open('interactive-intelligence');await page.keyboard.press('Control+2');assert(await page.getByText('sample · codex · fictional · model: model-a · thinking: high',{exact:true}).isVisible());await page.keyboard.press('Control+m');assert(await page.getByRole('button',{name:'Model: model-b ⌃M',exact:true}).isVisible());await page.keyboard.press('Control+Tab');assert(await page.getByRole('button',{name:'Thinking: high ⌃⇥',exact:true}).isVisible());await page.getByRole('button',{name:'claude · fictional ⌃1',exact:true}).click();assert(await page.getByRole('button',{name:'Model: model-a ⌃M',exact:true}).isVisible());assert(!(await page.getByRole('button',{name:'claude · offline · needs attention ⌃3',exact:true}).isEnabled()));assert(await page.getByText('arbol-claude-driver subscriptions sign-in offline',{exact:true}).isVisible());await page.keyboard.press('Control+3');assert(await page.getByText('sample · claude · fictional · model: model-a · thinking: high',{exact:true}).isVisible());
//  await open('loading-models');assert(await page.getByText('Loading models…',{exact:true}).isVisible());assert(!(await page.getByRole('button',{name:'Model: model-a ⌃M',exact:true}).isEnabled()));await open('catalog-failure');await page.getByRole('button',{name:'Retry models',exact:true}).click();assert.equal(await page.getByText('Models could not be read: fictional Driver unavailable.',{exact:true}).count(),0);
//  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();assert(await page.getByRole('button',{name:'Model: model-a ⌃M',exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('Shared Intelligence: local route/model/effort buttons and Ctrl shortcuts, unavailable states, loading/failure/retry and narrow navigation passed');
// }finally{await browser.close();server?.kill();}
// TEST-TIER-DISABLED-END scripts/check-elma-routing.mjs


throw new Error("Mid-tier checks require an explicitly requested testing task; see MID_TIER.md.");
