import { test, suite, mock, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { execa } from 'execa'
import dedent from 'dedent'

import { cliBuild, consola } from './rho.js'

const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)
const TestDataDir = path.join(Dirname, './testdata')
const OriginalCwd = process.cwd()
const Ctx = Object.freeze({
	options: {
		clean: false,
		verbose: false,
	},
	config: {
		buildJsFile: path.join(Dirname, 'rho.js'),
		contentDir: path.join(TestDataDir, 'content'),
		layoutDir: path.join(TestDataDir, 'layouts'),
		partialsDir: path.join(TestDataDir, 'partials'),
		staticDir: path.join(TestDataDir, 'static'),
		outputDir: path.join(TestDataDir, 'build'),
		transformOutputUri(/** @type {string} */ uri) {
			return uri
		},
		getLayout(
			/** @type {Record<PropertyKey, unknown>} */ frontmatter,
			/** @type {ContentForm} */ contentForm,
		) {
			return Buffer.from(`<!DOCTYPE html>
	<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
		</head>
		<body>
		{{__body}}
		</body>
	</html>
	`)
		},
	},
})

before(async () => {
	consola.mockTypes(() => mock.fn())
	await fs.rm(TestDataDir, { recursive: true, force: true })
})

beforeEach(async () => {
	await fs.mkdir(TestDataDir, { recursive: true })
	process.chdir(TestDataDir)
})

afterEach(async () => {
	process.chdir(OriginalCwd)
	await fs.rm(TestDataDir, { recursive: true, force: true })
})

suite('markdown tests', async () => {
	test('test/index.md', async () => {
		await writeFiles({
			'./content/post/test/index.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					+++
					water`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/test/index.html': /<p>water/,
		})
	})

	test('test/index.md with slug', async () => {
		await writeFiles({
			'./content/post/test/index.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					slug = 'my-slug'
					+++
					water`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/my-slug/index.html': /<p>water/,
		})
	})

	test('test/test.md', async () => {
		await writeFiles({
			'./content/post/test/test.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					+++
					Bravo`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/test/index.html': /<p>Bravo/,
		})
	})

	test('test/test.md with slug', async () => {
		await writeFiles({
			'./content/post/test/test.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					slug = 'my-slug'
					+++
					Bravo`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/my-slug/index.html': /<p>Bravo/,
		})
	})
})

suite('html tests', async () => {
	test('test/index.html', async () => {
		await writeFiles({
			'./content/post/test/index.html': dedent`
					<p>water</p>`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/test/index.html': /<p>water/,
		})
	})

	// test('test/index.html with slug', async () => {
	// 	await writeFiles({
	// 		'./content/post/test/index.html': dedent`
	// 				+++
	// 				title = 'Title'
	// 				author = 'First Last'
	// 				date = 2000-01-01
	// 				slug = 'my-slug'
	// 				+++
	// 				water`
	// 	})
	// 	await cliBuild(Ctx)

	// 	await assertFiles({
	// 		'./build/post/my-slug/index.html': /<p>water/
	// 	})
	// })

	test('test/test.html', async () => {
		await writeFiles({
			'./content/post/test/test.html': dedent`
					<p>Bravo</p>`,
		})
		await cliBuild(Ctx)

		await assertFiles({
			'./build/post/test/index.html': /<p>Bravo/,
		})
	})

	// test('test/test.html with slug', async () => {
	// 	await writeFiles({
	// 		'./content/post/test/test.html': dedent`
	// 				+++
	// 				title = 'Title'
	// 				author = 'First Last'
	// 				date = 2000-01-01
	// 				slug = 'my-slug'
	// 				+++
	// 				Bravo`
	// 	})
	// 	await cliBuild(Ctx)

	// 	await assertFiles({
	// 		'./build/post/my-slug/index.html': /<p>Bravo/
	// 	})
	// })
})

async function debugTestDir() {
	console.log('Entering debugging shell...')
	try {
		await execa('bash', { stdio: 'inherit' })
	} catch {}
}

async function writeFiles(/** @type {Record<string, string>} */ fileObject) {
	let /** @type {Promise<void>[]} */ promises = []
	for (const filename in fileObject) {
		promises.push(fs.mkdir(path.dirname(filename), { recursive: true }))
	}
	await Promise.all(promises)

	promises = []
	for (const filename in fileObject) {
		promises.push(fs.writeFile(filename, fileObject[filename]))
	}
	await Promise.all(promises)
}

async function assertFiles(/** @type {Record<string, string>} */ assertObject) {
	for (const filename in assertObject) {
		await test(`Evaluate file: ${filename}`, async (t) => {
			try {
				await fs.stat(filename)
			} catch (err) {
				if (err.code === 'ENOENT') {
					assert.fail(`File ${filename} does not exist`)
				} else {
					throw err
				}
			}

			const content = await fs.readFile(filename, 'utf8')

			if (typeof assertObject[filename] === 'string') {
				assert.equal(content, assertObject[filename].trim())
			} else if (assertObject[filename] instanceof RegExp) {
				assert.ok(assertObject[filename].test(content))
			} else {
				throw new Error(`User-supplied assert object could not be evaluated`)
			}
		})

		break
	}
}
