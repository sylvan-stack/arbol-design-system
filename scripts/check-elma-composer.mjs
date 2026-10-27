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
 await open('first-sapling');assert.equal(await message.getAttribute('rows'),'10');assert(await message.evaluate(el=>el===document.activeElement));assert.equal(await page.getByRole('button').count(),0);assert(await page.getByText('sample · claude · fictional · model: model-a · thinking: high',{exact:true}).isVisible());
 await message.fill('First line');await message.press('End');await message.press('Enter');await page.keyboard.type('Second line');assert.equal(await message.inputValue(),'First line\nSecond line');await message.press('Control+Enter');await page.getByText('Fictional message received: First line Second line').waitFor();assert.equal(await message.inputValue(),'');
 await open('closed');assert.equal(await message.count(),0);await page.locator('.answer').click();await page.keyboard.press('Enter');assert.equal(await message.getAttribute('rows'),'3');assert(await message.evaluate(el=>el===document.activeElement));await message.fill('Retained exact text');await message.press('Escape');assert.equal(await message.count(),0);await page.keyboard.press('Enter');assert.equal(await message.inputValue(),'Retained exact text');await message.press('Meta+Enter');await page.getByText('Fictional message received: Retained exact text',{exact:true}).waitFor();assert.equal(await message.count(),0);
 await page.getByRole('button',{name:'Scroll to top',exact:true}).click();await page.getByText('Scroll requested: top',{exact:true}).waitFor();await page.getByRole('button',{name:'Scroll to bottom',exact:true}).click();await page.getByText('Scroll requested: bottom',{exact:true}).waitFor();
 await open('with-draft');assert(await message.evaluate(el=>el===document.activeElement));assert.equal(await message.inputValue(),'A fictional retained Draft');
 await open('loading-draft');assert(await message.evaluate(el=>el.readOnly));assert(await page.getByText('Loading Draft…',{exact:true}).isVisible());
 await open('waiting');assert(await message.evaluate(el=>el.readOnly));await message.press('Meta+Enter');assert.equal(await page.getByText(/Fictional message received/).count(),0);
 await open('save-failed');assert.equal(await message.inputValue(),'My fictional unsaved text');assert(await page.getByRole('alert').isVisible());
 await open('changed-elsewhere');assert(await page.getByRole('region',{name:'Changed elsewhere'}).isVisible());assert(await page.getByText('My fictional changes',{exact:true}).isVisible());assert(await page.getByText('A fictional edit from another window',{exact:true}).isVisible());await page.getByRole('button',{name:'Take theirs',exact:true}).click();assert.equal(await message.inputValue(),'A fictional edit from another window');assert.equal(await page.getByRole('region',{name:'Changed elsewhere'}).count(),0);await open('changed-elsewhere');await page.getByRole('button',{name:'Keep mine',exact:true}).click();assert.equal(await message.inputValue(),'My fictional changes');
 await page.setViewportSize({width:390,height:844});await open('first-sapling');await page.locator('.example').evaluate(el=>el.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await message.boundingBox()).width<390);assert((await message.boundingBox()).height>=10*parseFloat(await message.evaluate(el=>getComputedStyle(el).lineHeight)));
 assert.deepEqual(errors,[]);console.log('Controlled composer: empty/closed/Draft/loading/busy/error, focus, multiline, send shortcuts, Escape retention, scrolling and narrow 200% text passed');
}catch(e){await page.screenshot({path:'/tmp/syl255-composer-failed.png',fullPage:true});throw e;}finally{await browser.close();server?.kill();}
