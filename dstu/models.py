from .db import db

class Person(db.Model):
    ipn = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.Text())
    
class Cert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.String(10), db.ForeignKey('person.ipn'))
    der = db.Column(db.LargeBinary())
