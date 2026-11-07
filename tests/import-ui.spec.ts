import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {readWorking,changeToken} from './storage-helpers';
test('JSON preview, atomic apply, readable sets, no overwrite, persistence and backup IDs',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Hardware import',exact:true}).click();
 await page.getByRole('button',{name:'Load JSON example'}).click();await expect(page.locator('#import-message')).toContainText('Validation passed');
 await expect(page.locator('#hardware-saved')).toContainText('0 schedule doors');await expect(page.locator('#import-summary')).toContainText('2 items, 2 assignments');
 await page.getByRole('button',{name:'Apply entire import'}).click();await expect(page.locator('#hardware-saved')).toContainText('2 schedule doors · 1 sets · 2 items · 2 assignments');
 await expect(page.locator('#applied-hardware')).toContainText('Doors: 001, 002');await expect(page.locator('#applied-hardware')).toContainText('Hinge, ball bearing');
 await page.screenshot({path:'test-results/hardware-import.png',fullPage:true});
 const saved=await readWorking(page);
 await page.getByRole('button',{name:'Load JSON example'}).click();await expect(page.locator('#import-errors')).toContainText('already exists');await expect(page.locator('#apply-import')).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'Hardware import',exact:true}).click();await expect(page.locator('#hardware-saved')).toContainText('2 schedule doors');
 expect(await readWorking(page)).toEqual(saved);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download data backup'}).click();const d=await downloaded;const data=JSON.parse(fs.readFileSync((await d.path())!,'utf8'));expect(data.project.doors[0].id).toBe(saved.doors[0].id);expect(data.project.imports[0].sources[0].text).toContain('supplierReference');
});
test('CSV separate tables, column mapping, preview errors and corrected file',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Hardware import',exact:true}).click();
 await page.locator('#sets-csv').setInputFiles('public/templates/hardware-sets.csv');await page.locator('#items-csv').setInputFiles('public/templates/hardware-items.csv');
 await page.locator('#doors-csv').setInputFiles({name:'custom.csv',mimeType:'text/csv',buffer:Buffer.from('Mark,Set,Level\n001,missing,01\n002,0007,01\n')});
 await page.getByRole('button',{name:'Read selected files'}).click();await expect(page.locator('#preview-import')).toBeEnabled();
 await page.getByLabel('doors: doorMark',{exact:true}).selectOption('Mark');await page.getByLabel('doors: hardwareSetId',{exact:true}).selectOption('Set');await page.getByLabel('doors: level',{exact:true}).selectOption('Level');
 await page.getByRole('button',{name:'Validate & preview'}).click();await expect(page.locator('#import-errors')).toContainText('row 2');await expect(page.locator('#import-errors')).toContainText('does not exist');await expect(page.locator('#apply-import')).toBeDisabled();await expect(page.locator('#import-rows tr')).toHaveCount(6);
 const report=page.waitForEvent('download');await page.getByRole('button',{name:'Download staged report'}).click();expect(JSON.parse(fs.readFileSync((await (await report).path())!,'utf8')).sources[0].text).toContain('missing');
 await page.locator('#doors-csv').setInputFiles('public/templates/door-assignments.csv');await page.getByRole('button',{name:'Read selected files'}).click();await expect(page.locator('#preview-import')).toBeEnabled();await page.getByRole('button',{name:'Validate & preview'}).click();await expect(page.locator('#import-message')).toContainText('Validation passed');await page.getByRole('button',{name:'Apply entire import'}).click();await expect(page.locator('#applied-hardware')).toContainText('Doors: 001, 002');
});
test('storage failure and other-tab changes never apply or overwrite staged data',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Hardware import',exact:true}).click();await page.getByRole('button',{name:'Load JSON example'}).click();await expect(page.locator('#apply-import')).toBeEnabled();
 await page.evaluate(()=>{IDBObjectStore.prototype.put=()=>{throw new DOMException('Quota exceeded','QuotaExceededError');};});await page.getByRole('button',{name:'Apply entire import'}).click();await expect(page.locator('#import-message')).toContainText('Nothing applied');await expect(page.locator('#hardware-saved')).toContainText('0 schedule doors');
 await page.reload();await page.getByRole('button',{name:'Hardware import',exact:true}).click();await page.getByRole('button',{name:'Load JSON example'}).click();await expect(page.locator('#apply-import')).toBeEnabled();await changeToken(page);await page.getByRole('button',{name:'Apply entire import'}).click();await expect(page.locator('#import-message')).toContainText('another tab');expect(await readWorking(page)).toMatchObject({revision:0});
});

test('damaged stored data is protected and recovery exports original bytes',async({page})=>{
 const raw='{"schemaVersion":1,"revision":0,"hardwareSets":[null]}';
 await page.addInitScript(value=>localStorage.setItem('dhv.hardware-project.v1',value),raw);
 await page.goto('/');await page.getByRole('button',{name:'Hardware import',exact:true}).click();
 await expect(page.locator('#hardware-saved')).toContainText('Imports are blocked');
 await page.getByRole('button',{name:'Load JSON example'}).click();await expect(page.locator('#import-message')).toContainText('Validation passed');await expect(page.locator('#apply-import')).toBeDisabled();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download data backup'}).click();const d=await pending;expect(JSON.parse(fs.readFileSync((await d.path())!,'utf8')).originalStoredText).toBe(raw);
 expect(await page.evaluate(()=>localStorage.getItem('dhv.hardware-project.v1'))).toBe(raw);
});
