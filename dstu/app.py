import os.path
from flask import Flask
cfg_path = os.path.join(os.environ['HOME'], 'db.cfg')

app = Flask(__name__)
app.config.from_pyfile(cfg_path, silent=True)
