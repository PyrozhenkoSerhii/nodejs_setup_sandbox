TODO:
- on failure implementation
- leader election implementation
- when rabbitmq fails with Critical status, we need to handle disconnect a bit better (or don't even call it maybe?) </br>
Right now it fails with errors because we try to reconnect while disconnecting