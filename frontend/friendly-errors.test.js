import test from 'node:test';import assert from 'node:assert/strict';import {friendlyError} from './friendly-errors.js';
test('translates network errors',()=>assert.match(friendlyError(new Error('Failed to fetch')),/conexão/i));
test('translates codec errors',()=>assert.match(friendlyError(new Error('Unsupported codec')),/MP4/i));
test('does not leak unknown technical errors',()=>assert.doesNotMatch(friendlyError(new Error('SECRET_ACCESS_TOKEN=abc')),/SECRET_ACCESS_TOKEN/));
