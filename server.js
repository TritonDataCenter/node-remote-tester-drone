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

https.createServer(httpsOpt, function (req, res) {
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
  pipeSpawn(gitCmd, ['checkout', co], {cwd: nodeCheckout},
            res, function () { clean(res) })
}

function clean (res) {
  pipeSpawn(gitCmd, ['clean', '-fd'], {cwd: nodeCheckout}, res, function () {
    pipeSpawn(cleanCmd, cleanArgs, {cwd: nodeCheckout}, res, function () {
      if (configCmd) configure(res)
      else build(res)
    })
  })
}

function configure (res) {
  var cmd = path.resolve(nodeCheckout, configCmd)
  pipeSpawn(cmd, configArgs, {cwd: nodeCheckout},
            res, function () { build(res) })
}

function build (res) {
  pipeSpawn(buildCmd, buildArgs, {cwd: nodeCheckout},
            res, function () { makeTest(res) })
}

function makeTest (res) {
  pipeSpawn(testCmd, testArgs, {cwd: nodeCheckout},
            res, function () { res.end('\n\nOK\n'); testsRunning = false })
}

function pipeSpawn (cmd, args, opt, res, cb) {
  var title = cmd + ' ' + args.map(JSON.stringify).join(' ')
  console.log(title)
  res.write('> ' + title + '\n')

  var child = spawn(cmd, args, opt)
  child.stdout.on('data', function (c) {
    res.write(c)
  })
  child.stderr.on('data', function (c) {
    res.write(c)
  })
  child.on('close', function (code) {
    if (code) {
      res.end('ERROR: ' + title +
              ' failed with code ' + code + '\n')
      testsRunning = false
      return
    }
    cb()
  })
}
