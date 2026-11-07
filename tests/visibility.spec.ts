import {test,expect} from '@playwright/test';
test('individual door hide/unhide affects real geometry, picking and markers; row selection never unhides',async({page})=>{
 await page.goto('/');await expect(page.locator('#toggle-element-visibility')).toBeDisabled();
 await page.getByRole('button',{name:'Open example',exact:true}).click();await expect(page.locator('#status')).toContainText('2 doors');
 await page.getByRole('button',{name:'D-101',exact:true}).click();await page.locator('#visibility').selectOption('doors');await page.locator('#markers-toggle').check();
 const marker=page.locator('.door-marker').filter({hasText:'D-101'});await expect(marker).toBeVisible();
 const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;const before=await canvas.screenshot();
 await page.getByRole('button',{name:'Hide selected element',exact:true}).click();await expect(page.locator('#hidden-elements summary')).toHaveText('Hidden elements (1)');await expect(marker).toHaveCount(0);await expect(page.locator('tr.selected')).toContainText('Hidden');expect((await canvas.screenshot()).equals(before)).toBe(false);
 await canvas.click({position:{x:box.width/2,y:box.height/2}});await expect(page.locator('tr.selected')).toHaveCount(0);
 await page.getByRole('button',{name:'D-101',exact:true}).click();await expect(page.locator('#toggle-element-visibility')).toHaveText('Unhide selected element');await expect(marker).toHaveCount(0);
 await page.locator('#visibility').selectOption('all');await page.locator('#visibility').selectOption('transparent');await page.locator('#visibility').selectOption('doors');await expect(page.locator('#hidden-elements summary')).toHaveText('Hidden elements (1)');await expect(marker).toHaveCount(0);
 await page.getByRole('button',{name:'Unhide selected element',exact:true}).click();await expect(marker).toBeVisible();await expect(page.locator('#hidden-elements summary')).toHaveText('Hidden elements (0)');
 await page.locator('#markers-toggle').uncheck();await canvas.click({position:{x:10,y:10}});await canvas.click({position:{x:box.width/2,y:box.height/2}});await expect(page.locator('tr.selected')).toContainText('D-101');
 await page.getByRole('button',{name:'Hide selected element',exact:true}).click();await page.getByRole('button',{name:'D-102',exact:true}).click();await page.getByRole('button',{name:'Hide selected element',exact:true}).click();await expect(page.locator('#hidden-elements li')).toHaveCount(2);
 const first=page.locator('#hidden-elements li').filter({hasText:'D-101'});await first.getByRole('button',{name:'Unhide',exact:true}).click();await expect(page.locator('#hidden-elements li')).toHaveCount(1);await expect(page.locator('#hidden-elements')).toContainText('D-102');
 await page.locator('#unhide-all').click();await expect(page.locator('#hidden-elements summary')).toHaveText('Hidden elements (0)');
});
test('pick and hide a non-door IFC element; new/failed model clears view-only hidden state',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:'Open example',exact:true}).click();await expect(page.locator('#status')).toContainText('11 rendered elements');
 const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;let found=false;
 for(const [x,y] of [[.5,.5],[.5,.65],[.65,.5],[.35,.5],[.65,.65]]){
  await canvas.click({position:{x:box.width*x,y:box.height*y}});
  const cls=await page.locator('#details dl dd').first().textContent({timeout:1000}).catch(()=>'');
  if(cls==='IfcWall'||cls==='IfcSlab'){found=true;break;}
 }
 expect(found,'Pick a genuine non-door element in the rendered IFC').toBe(true);
 await page.getByRole('button',{name:'Hide selected element',exact:true}).click();await expect(page.locator('#hidden-elements li')).toHaveCount(1);await expect(page.locator('#hidden-elements')).toContainText(/IfcWall|IfcSlab/);
 await page.screenshot({path:'test-results/element-visibility.png',fullPage:true});
 await page.locator('#file').setInputFiles({name:'bad.ifc',mimeType:'text/plain',buffer:Buffer.from('bad IFC')});await expect(page.locator('#status')).toContainText('Unable to load IFC');await expect(page.locator('#hidden-elements summary')).toHaveText('Hidden elements (0)');await expect(page.locator('#toggle-element-visibility')).toBeDisabled();
 await page.locator('#file').setInputFiles('public/fixtures/two-doors.ifc');await expect(page.locator('#status')).toContainText('2 doors');await page.getByRole('button',{name:'D-101',exact:true}).click();await expect(page.locator('#toggle-element-visibility')).toHaveText('Hide selected element');
 expect(errors).toEqual([]);
});
