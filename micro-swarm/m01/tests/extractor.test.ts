import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';
import {extractSource,extractAndValidate,validateSyntax} from '../src/extractor.ts';
const root=resolve(import.meta.dirname,'..');
test('raw Python preserved except boundary whitespace',async()=>{const r=await extractAndValidate(root,'\ufeff\nimport sqlite3\nx = 1\n','python');assert.equal(r.format,'raw');assert.equal(r.source,'import sqlite3\nx = 1\n');});
test('single fenced block extracts deterministically',async()=>{const r=await extractAndValidate(root,'Here is code:\n```python\nx=1\n```\nExplanation.','python');assert.equal(r.format,'fenced');assert.equal(r.source,'x=1\n');});
test('ambiguous, wrong language, incomplete, empty, NUL fail',()=>{for(const text of ['```python\nx=1','```sql\nselect 1;\n```','```python\nx=1\n```\n```python\ny=2\n```','', '\0'])assert.throws(()=>extractSource(text,'python'),{category:'extraction_error'});});
test('prose, invalid syntax, comment/docstring only fail',async()=>{await assert.rejects(extractAndValidate(root,'Here is your source code:','python'),{category:'syntax_error'});await assert.rejects(extractAndValidate(root,'# commentary only','python'),{category:'syntax_error'});assert.equal(validateSyntax(root,'"docstring only"','python').valid,false);});
test('validator does not execute/import generated Python',async()=>{const r=await extractAndValidate(root,'import nonexistent_dependency\nraise RuntimeError("never execute")','python');assert.equal(r.format,'raw');});
test('SQL cannot attach host files',async()=>{await assert.rejects(extractAndValidate(root,"CREATE TABLE products(id); CREATE TABLE reservations(id); ATTACH '/private/tmp/escape.db' AS escaped;",'sql'),{category:'syntax_error'});});
