exports.port = process.env.PORT || 1337

var fs = require('fs')
exports.https = {
  key: fs.readFileSync(__dirname + '/ssl/server.key'),
  cert: fs.readFileSync(__dirname + '/ssl/server.crt')
}

try {
  exports.secret = fs.readFileSync(__dirname + '/secret.txt', 'utf8').trim()
} catch (e) {
  exports.secret = null
}

if (process.platform === 'win32') {
  exports.gitCmd = 'git'

  exports.configCmd = null
  exports.configArgs = []

  exports.buildCmd = 'vcbuild.bat'
  exports.buildArgs = ['release', 'debug']
  if (process.arch === 'x64') {
    exports.buildArgs.push('x64')
  }

  exports.cleanCmd = 'vcbuild.bat'
  exports.cleanArgs = ['clean']

  exports.testCmd = 'vcbuild.bat'
  exports.testArgs = ['test']

} else {
  exports.gitCmd = 'git'

  exports.configCmd = './configure'
  exports.configArgs = []

  exports.buildCmd = 'make'
  var cpus = require('os').cpus()
  var jobs = cpus && cpus.length || 2
  exports.buildArgs = ['-j' + jobs]

  exports.cleanCmd = 'make'
  exports.cleanArgs = ['clean']

  exports.testCmd = 'make'
  exports.testArgs = ['test-all']
}
