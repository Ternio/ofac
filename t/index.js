var fs = require('fs');
var assert = require('assert').strict;
const ofac = require('../index.js');
const fn = '/tmp/sdn.xml';

var expected = [{
	uid: '4106',
	firstName: 'Helmer',
	lastName: 'HERRERA BUITRAGO',
	sdnType: 'Individual',
	programList: [ 'SDNT' ],
	idList: [
		{ uid: '1011', idType: 'Passport', idNumber: 'J287011', idCountry: 'Colombia' },
		{ uid: '1010', idType: 'Cedula No.', idNumber: '16247821', idCountry: 'Colombia' } 
	],
	akaList: [
		{ uid: '7776', type: 'a.k.a.', category: 'weak', lastName: 'PACHO' },
		{ uid: '7777', type: 'a.k.a.', category: 'weak', lastName: 'H7' } 
	],
	addressList: [
		{ uid: '2006', city: 'Cali', country: 'Colombia' }
	],
	dateOfBirthList: [
		{ uid: '1031', dateOfBirth: '24 Aug 1951', mainEntry: 'true' },
		{ uid: '1032', dateOfBirth: '05 Jul 1951', mainEntry: 'false' }
	]
}];

describe('OFAC', () => {
	describe('Archive fetch', () => {
		var zip = '/tmp/sdn.xml.zip';
		before(() => {
			var rs = fs.createReadStream('t/sdn.xml.zip')
			ofac.config({
				fetch: () => Promise.resolve({body: rs})
			})
			if (fs.existsSync(zip)) fs.unlinkSync(zip);
		});
		it('File created', () => {
			return ofac.fetch('sdn.xml.zip').then(fn => {
				assert.ok(fn == zip, 'Incorrect file name')
				assert.ok(fs.existsSync(fn, 'File was not fetched'))
			})
		})
	})
	describe('Archive extraction', () => {
		var zip = 't/sdn.xml.zip', fn = 'sdn.xml';
		before(() => {
			let path = '/tmp/' + fn;
			if (fs.existsSync(path)) fs.unlinkSync(path);
		})
		it('File does not exist', () => {
			return ofac.zipExtract(zip + '-fail', fn, '/tmp')
				.then(() => {
					assert.ok(false, 'Should have failed')
				})
				.catch(e => {
					var expected = {
						zip: "t/sdn.xml.zip-fail",
						xml: "/tmp/sdn.xml",
						src: "on",
						err: {
							errno: -2,
							code: "ENOENT",
							syscall: "open",
							path: "t/sdn.xml.zip-fail"
						}
					};

					e = JSON.parse(JSON.stringify(e)) // errors stringify differently
					assert.deepEqual(e, expected, 'Did not fail when it should have')
				})
		})
		it('Extraction', async () => {
			var path = '/tmp/' + fn;
			assert.ok(fs.existsSync(zip), 'Archive does not exist');
			assert.ok(!fs.existsSync(path), 'Extract exists');

			var actual = await ofac.zipExtract(zip, fn, '/tmp');

			assert.equal(actual, path, 'Extracted a different file');
			assert.ok(fs.existsSync(path), 'Extract file does not exist');
			
			var stats = fs.statSync(path);
			assert.equal(stats.size, 10128, 'File incomplete')
		})
	})
	describe('Archive information', () => {
		var info;
		before(async () => {
			info = await ofac.dbinfo();
		})
		it('Returns publish date', () => {
			assert.equal(info['Publish Date'], '03/11/2019', 'Date extraction failed')
		})
		it('Returns record count', () => {
			assert.equal(info['Record Count'], '7449', 'Record count extraction failed')
		})
	})
	describe('Search', () => {
		it('Searched by id/country', async () => {
			var cust = {id: 'J287011', country: 'Colombia'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected);
		})
		it('Searched by id/country with type', async () => {
			var cust = {id: 'J287011', id_type: 'Passport', country: 'Colombia'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected);
		})
		it('Searched by id/country with wrong type', async () => {
			var cust = {id: 'J287011', id_type: 'Cedula No.', country: 'Colombia'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, []);
		})
		it('Searched by first/last', async () => {
			var cust = {firstName: 'Helmer', lastName: 'HERRERA BUITRAGO'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected, 'Name search differs');
		})
		it('Searched case insensitive', async () => {
			var cust = {firstName: 'Helmer', lastName: 'herrera buitrago'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected, 'Name search differs');
		})
		it('Searched clean names', async () => {
			var cust = {firstName: 'Helmer', lastName: 'herrera-buitrago'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected, 'Name search differs');
		})
		it('Checked aliases', async () => {
			var cust = {firstName: 'Helmer', lastName: 'pacho'};
			var actual = await ofac.search(cust);
			assert.deepEqual(actual, expected, 'Name search differs');
		})
		it('Uses external path', async () => {
			var moved = fn.replace(/xml$/, 'moved.xml')
			fs.renameSync(fn, moved)
			assert.ok(fs.existsSync(moved), 'File move failed')
			var cust = {id: 'J287011', country: 'Colombia'};
			var actual = await ofac.search(cust, '/tmp/sdn.moved.xml');
			assert.deepEqual(actual, expected);
		})
		it('Bad XML produces exception', (done) => {
			var cust = {id: 'J287011', country: 'Colombia'};
			assert.rejects(
				() => ofac.search(cust, 't/bad.xml').finally(done), 
				{message: 'Error: Unexpected close tag\nLine: 0\nColumn: 317\nChar: >'}
			);
		})
		it('No match found', async () => {
			var cust = {firstName: 'XX', lastName: 'XX'};
			var actual = await ofac.search(cust, '/tmp/sdn.moved.xml');
			assert.deepEqual(actual, [], 'Empty array expected');
		})
	})
})
