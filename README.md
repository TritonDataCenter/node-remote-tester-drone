The drone in the node-remote-tester hive.

## USAGE

On the drone:

1. Create an SSL key and cert, and put them in `ssl/server.{key,crt}`.
   (Alternatively, edit the `config.js` to specify their location.)
2. Start the drone server.

On the hub:

1. `git remote add drone https://droneserver:1337/node`
2. `GIT_SSL_NO_VERIFY=1 git push --all drone`
3. `curl -X POST -d <commit-ish> https://droneserver:1337/test`

The output from the checkout and test will stream to the client.

## TODO

1. We should be able to use this for libuv as well.

2. It'd be nice to skip the clean step sometimes, or maybe
   only run it if a build fails or something.  It's
   a bit slow otherwise.

3. It'd be good if it removed the checkout folder
   when the git actions fail, but removing the whole
   checkout on test failure is too extreme.
