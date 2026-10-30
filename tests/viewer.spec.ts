import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('real IFC: local load, doors, properties, canvas picking, search, reopen and errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.locator('#file').setInputFiles('public/fixtures/two-doors.ifc');
 await expect(page.locator('#status')).toContainText('IFC4 · 11 rendered elements · 2 doors');
 await expect(page.locator('#rows tr')).toHaveCount(2);
 await page.getByRole('button',{name:'D-101',exact:true}).click();
 await expect(page.locator('#details')).toContainText('IfcDoor');
 await expect(page.locator('#details')).toContainText('0000000000000000000030');
 await expect(page.locator('#details')).toContainText('FireRating');
 await expect(page.locator('#details')).toContainText('60 min');
 await expect(page.locator('tr.selected')).toContainText('D-101');
 await page.locator('#visibility').selectOption('doors');
 // Focus a different door, clear by clicking background, then pick actual rendered door at camera target.
 await page.getByRole('button',{name:'D-102',exact:true}).click();
 const canvas=page.locator('canvas');const rect=(await canvas.boundingBox())!;
 await canvas.click({position:{x:10,y:10}});await expect(page.locator('tr.selected')).toHaveCount(0);
 await canvas.click({position:{x:rect.width/2,y:rect.height/2}});
 await expect(page.locator('tr.selected')).toContainText('D-102');
 await expect(page.locator('#details')).toContainText('Office door');
 await page.screenshot({path:'test-results/door-review.png',fullPage:true});
 await page.locator('#search').fill('D-101');await expect(page.locator('#rows tr')).toHaveCount(1);
 await page.locator('#search').fill('unmatched');await expect(page.locator('#empty')).toHaveText('No doors match your search.');
 await page.locator('#visibility').selectOption('transparent');await page.locator('#fit').click();
 // Exercise orbit, pan, and zoom against the real canvas.
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2+30,{steps:8});await page.mouse.up();await page.mouse.wheel(0,120);
 await page.mouse.down({button:'right'});await page.mouse.move(rect.x+rect.width/2+80,rect.y+rect.height/2+30,{steps:6});await page.mouse.up({button:'right'});
 await page.locator('#file').setInputFiles({name:'bad.ifc',mimeType:'text/plain',buffer:Buffer.from('not IFC')});
 await expect(page.getByRole('alert')).toContainText('not an IFC STEP file');await expect(page.locator('#fit')).toBeDisabled();
 await page.getByRole('button',{name:'Open example'}).click();await expect(page.locator('#status')).toContainText('2 doors');
 await page.locator('#search').fill('');await page.getByRole('button',{name:'D-101',exact:true}).click();await expect(page.locator('#details')).toContainText('FireRating');
 expect(errors).toEqual([]);
});
test('duplicate and missing GlobalIds are visible and selectable',async({page})=>{
 await page.goto('/');const text=fs.readFileSync('public/fixtures/two-doors.ifc','utf8').replaceAll('0000000000000000000031','0000000000000000000030');
 await page.locator('#file').setInputFiles({name:'duplicates.ifc',mimeType:'text/plain',buffer:Buffer.from(text)});
 await expect(page.locator('#status')).toContainText('invalid identities');
 await page.getByRole('button',{name:'D-102',exact:true}).click();await expect(page.locator('#details')).toContainText('Duplicate GlobalId');
 const missing=text.replace("IFCDOOR('0000000000000000000030'","IFCDOOR($");
 await page.locator('#file').setInputFiles({name:'missing.ifc',mimeType:'text/plain',buffer:Buffer.from(missing)});
 await expect(page.locator('#status')).toContainText('2 doors');await page.getByRole('button',{name:'D-101',exact:true}).click();await expect(page.locator('#details')).toContainText('Missing GlobalId');
});
