import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

URI  = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USER")
PWD  = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(
    URI,
    auth=(USER, PWD),
    max_connection_lifetime=3600,       # ← drop connections before Neo4j kills them
    max_connection_pool_size=50,
    connection_acquisition_timeout=30,

    # Check the connection is still alive before using it.
    # If it dropped (idle timeout), the driver reopens it automatically.
    liveness_check_timeout=30,
    # How long to keep retrying a failed transaction before giving up (seconds).
    max_transaction_retry_time=15,
    # Keep connections warm — Aura closes idle connections after ~2 minutes.
    keep_alive=True,
)

def get_db():
    return driver.session()

print(f"--- Connecting to: {URI} ---")