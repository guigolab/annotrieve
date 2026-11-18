"""In-process mongomock connection that works on every supported mongoengine.

mongoengine >= 0.28 wants `mongo_client_class=`; the pinned 0.26 (CI/production) only knows the
`mongomock://` host scheme and rejects the keyword.
"""
import mongomock
from mongoengine import connect, disconnect


def connect_mongomock(db: str) -> None:
    disconnect(alias="default")
    try:
        connect(db=db, alias="default", mongo_client_class=mongomock.MongoClient)
    except Exception:  # mongoengine 0.26 wraps pymongo's 'Unknown option' in ConnectionFailure
        disconnect(alias="default")
        connect(db=db, alias="default", host="mongomock://localhost")
