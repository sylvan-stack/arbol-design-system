import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.STORYBOOK_URL||'http://127.0.0.1:6111';
const server=process.env.STORYBOOK_URL?undefined:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'6111'},stdio:'ignore'});
if(server)for(let i=0;i<100;i++){try{if((await fetch(base+'/index.json')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const message=page.getByRole('textbox',{name:'Message',exact:true});
async function open(name){await page.goto(base+'/iframe.html?id=sections-composer--'+name+'&viewMode=story');await page.getByRole('region',{name:'Message composer'}).waitFor();}
try{
 await open('closed');assert.equal(await message.count(),0);await page.locator('.answer').click();await page.keyboard.press('Enter');assert.equal(await message.getAttribute('rows'),'3');assert(await message.evaluate(el=>el===document.activeElement));await message.fill('Retained exact text');await message.press('Escape');assert.equal(await message.count(),0);await page.keyboard.press('Enter');assert.equal(await message.inputValue(),'Retained exact text');await message.press('Meta+Enter');await page.getByText('Fictional message received: Retained exact text',{exact:true}).waitFor();assert.equal(await message.count(),0);
 await page.setViewportSize({width:390,height:844});await open('first-sapling');await page.locator('.example').evaluate(el=>el.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await message.boundingBox()).width<390);assert((await message.boundingBox()).height>=10*parseFloat(await message.evaluate(el=>getComputedStyle(el).lineHeight)));
 assert.deepEqual(errors,[]);console.log('Retained SYL-327 browser selection passed; see MID_TIER.md for scope');
}catch(e){await page.screenshot({path:'/tmp/syl255-composer-failed.png',fullPage:true});throw e;}finally{await browser.close();server?.kill();}
