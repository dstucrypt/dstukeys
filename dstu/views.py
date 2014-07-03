import os.path
import hashlib
from flask import render_template, url_for, request

from .app import app
from .db import db
from .models import Person, Cert
from .util import pem_to_der, der_to_pem

def hash_for(path):
    full_path = os.path.join(app.static_folder, path)
    sha1 = hashlib.sha1(open(full_path).read())
    return sha1.hexdigest()[:4]

def static_url(path):
    if path.endswith('.js'):
        return url_for('static', filename=path, hv=hash_for(path))

    return url_for('static', filename=path)

@app.context_processor
def ctx_util():
    return {
        "static_url": static_url,
    }


@app.route("/toolbox/")
def index():
    return render_template("index.html")


@app.route("/certview")
def certview():
    return render_template("cert.html")

@app.route('/api/cert/ipn/<ipn>')
def cert_ipn(ipn):
    cert = Cert.query.filter_by(person_id=ipn).first()

    return der_to_pem(cert.der, 'CERTIFICATE')

@app.route("/api/cert.publish", methods=['POST'])
def certpub():
    ipn = request.form['ipn']
    pem = request.form['cert']
    der = pem_to_der(pem)

    person = Person.query.filter_by(ipn=ipn).first()
    if person is None:
        person = Person(ipn=ipn)

    cert = Cert(person_id=person.ipn, der=der)

    db.session.add(person)
    db.session.commit()

    db.session.add(cert)
    db.session.commit()

    return "OK"
