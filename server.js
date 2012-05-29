// TODO:
//
// 1. we should be able to use this for libuv as well.
//
// 2. it'd be nice to skip the clean step sometimes, or
// maybe only run it if a build fails or something.  It's
// a bit slow otherwise.
//
// 3. It'd be good if it removed the checkout folder
// when the git actions fail, but removing the whole
// checkout on test failure is too extreme.
//
// 4. Have a way for the drone to register itself with the
// hub.
//
// 5. Dry it up.  Maybe each command should be tied to a
// specific path or something.

var http = require('http')
var https = require('https')
var spawn = require('child_process').spawn
var pushover = require('pushover')
var path = require('path')
var repoDir = path.resolve(__dirname, 'repos')
var nodeRepo = path.resolve(repoDir, 'node')
var repos = pushover(repoDir)
var checkoutDir = path.resolve(__dirname, 'checkout')
var nodeCheckout = path.resolve(checkoutDir, 'node')
var StringDecoder = require('string_decoder').StringDecoder
var fs = require('fs')
var rimraf = require('rimraf')

var config = require('./config.js')
var gitCmd = config.gitCmd
var testCmd = config.testCmd
var testArgs = config.testArgs
var cleanCmd = config.cleanCmd
var cleanArgs = config.cleanArgs
var configCmd = config.configCmd
var configArgs = config.configArgs
var buildCmd = config.buildCmd
var buildArgs = config.buildArgs
var httpsOpt = config.https
var port = config.port
var secret = config.secret

https.createServer(httpsOpt, function (req, res) {
  // if we have a shared secret, then only accept requests with that
  if (secret) {
    var auth = req.headers.authorization
    if (!auth) {
      res.statusCode = 401
      res.setHeader('WWW-Authenticate', 'Basic realm="node tester drone"')
      return res.end('auth required')
    }
    auth = new Buffer(auth.replace(/^Basic /, ''), 'base64').toString()
    auth = (auth === 'node:' + secret)
    if (!auth) {
      res.statusCode = 403
      return res.end('unauthorized')
    }
  }

  if (req.method === 'POST' && req.url === '/test') {
    return runTests(req, res)
  }
  repos.handle(req, res)
}).listen(port, function () {
  console.error('drone listening on port %d', port)
})

var testsRunning = false
function runTests (req, res) {
  res.setHeader('content-type', 'text/plain')
  if (testsRunning) {
    res.statusCode = 503
    return res.end('Tests already running. Try again later.')
  }

  testsRunning = true
  // the post body is the commit-ish to test.
  var co = ''
  var decoder = new StringDecoder()
  req.on('data', function (c) {
    co += decoder.write(c)
  })
  req.on('end', function () {
    runTests_(co, res)
  })
}

function runTests_ (co, res) {
  // if the dir isn't there then check it out.
  fs.stat(nodeCheckout, function (er) {
    if (er) clone(co, res)
    else fetch(co, res)
  })
}

function clone (co, res) {
  pipeSpawn(gitCmd, ['clone', nodeRepo, nodeCheckout], {},
            res, function () { fetch(co, res) })
}

function fetch (co, res) {
  pipeSpawn(gitCmd, ['fetch', '-a', nodeRepo], {cwd: nodeCheckout},
            res, function () { checkout(co, res) })
}

function checkout (co, res) {
  pipeSpawn(gitCmd, ['checkout', co], {cwd: nodeCheckout}, res, function () {
    // TODO: only clean when requested
    // clean(res)

    return configure(res)
  })
}

function clean (res) {
  pipeSpawn(gitCmd, ['clean', '-fd'], {cwd: nodeCheckout}, res, function () {
    pipeSpawn(cleanCmd, cleanArgs, {cwd: nodeCheckout}, res, function () {
      configure(res)
    })
  })
}

function configure (res) {
  if (!configCmd) return build(res)
  var cmd = path.resolve(nodeCheckout, configCmd)
  pipeSpawn(cmd, configArgs, {cwd: nodeCheckout},
            res, function () { build(res) })
}

function build (res) {
  pipeSpawn(buildCmd, buildArgs, {cwd: nodeCheckout},
            res, function () { makeTest(res) })
}

function makeTest (res) {
  pipeSpawn(testCmd, testArgs, {cwd: nodeCheckout}, res, function () {
    res.end('\nOK\n')
    process.stdout.write('\nOK\n')
    testsRunning = false
  })
}

function pipeSpawn (cmd, args, opt, res, cb) {
  var title = cmd + ' ' + args.map(JSON.stringify).join(' ')
  console.log('> ' + title)
  res.write('> ' + title + '\n')

  var child = spawn(cmd, args, opt)
  child.stdout.pipe(res, { end: false })
  child.stderr.pipe(res, { end: false })

  var ev = 'close'
  if (process.version.match(/^v0\.[0-6]\./)) ev = 'exit'
  child.on(ev, function (code) {
    if (code) {
      var er = 'ERROR: ' + title +
               ' failed with code ' + code + '\n'
      process.stderr.write(er)
      res.end(er)
      testsRunning = false
      return
    }
    cb()
  })
}
