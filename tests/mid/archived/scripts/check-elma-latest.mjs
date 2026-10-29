
// LOW TIER — DO NOT ENABLE OR RECREATE
// Historical examples only. Read before adding related tests; never execute.
// LOW-TIER-BEGIN: tests/mid/archived/scripts/check-elma-latest.mjs
// Reason: Routine fixed-list keyboard selections, empty/loading labels and local refusal messages repeat shared navigation and modal mechanics. Case reviewed: Standalone check elma latest check program; its combined scenarios are retained together.
// Source: arbol-design-system@d58f33487f0d2a47a2b42d307e6e5eeea7db8fc7:tests/mid/archived/scripts/check-elma-latest.mjs
// Historical fixtures and class context are available at the source revision; no active dependencies restored.
// LOW-TIER-SOURCE-BEGIN
// import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
// const base=process.env.STORYBOOK_URL||'http://127.0.0.1:6118',server=process.env.STORYBOOK_URL?undefined:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'6118'},stdio:'ignore'});if(server)for(let i=0;i<100;i++){try{if((await fetch(base+'/index.json')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
// const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const open=async id=>{await page.goto(base+'/iframe.html?id='+id+'&viewMode=story');await page.getByRole('dialog',{name:'Latest chats',exact:true}).waitFor();};
// try{
//  await open('sections-elmaframe--latest-chats');assert.equal(await page.locator('button[data-command-row]').count(),12);await page.keyboard.press('0');await page.getByRole('heading',{name:/Elma Chat.*Fictional chat 10/}).waitFor();await page.keyboard.press('Control+Shift+Meta+c');await page.getByRole('dialog',{name:'Latest chats',exact:true}).waitFor();for(let i=0;i<11;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.getByRole('heading',{name:/Elma Chat.*Fictional chat 12/}).waitFor();await page.keyboard.press('Control+Shift+Meta+c');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
//  await open('sections-elmaframe--latest-empty');await page.getByText('No other recent chats.',{exact:true}).waitFor();await open('sections-elmaframe--latest-loading');await page.getByText('Loading latest chats…',{exact:true}).waitFor();await open('sections-elmaframe--latest-failure');await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'Retry latest chats',exact:true}).isEnabled());
//  await open('sections-elmaframe--latest-selection-failure');await page.keyboard.press('1');await page.getByRole('dialog').getByRole('alert').filter({hasText:'This chat cannot be read now.'}).waitFor();assert(await page.getByRole('heading',{name:/A fictional conversation/}).isVisible());
//  await page.setViewportSize({width:390,height:844});await open('sections-elmaframe--latest-chats');await page.locator('.elma-frame').evaluate(el=>el.style.setProperty('--font-scale','2'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await open('sections-elmaframe--stale-latest');await page.locator('.elma-frame').evaluate(el=>el.style.setProperty('--font-scale','2'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/syl256-stale-latest-narrow.png',fullPage:true});assert.deepEqual(errors,[]);console.log('Shared latest chats: bounded-row adapter,0/arrow/Return/Escape, metadata, empty/loading/refusal/retry and narrow200% passed');
// }finally{await browser.close();server?.kill();}
// LOW-TIER-SOURCE-END
// LOW-TIER-END
