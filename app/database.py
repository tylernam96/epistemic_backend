import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

# This finds the .env file one level up from the 'app' folder
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

URI = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USER")
PWD = os.getenv("NEO4J_PASSWORD")

# Create the driver using the variables we just pulled
driver = GraphDatabase.driver(URI, auth=(USER, PWD))

def get_db():
    return driver.session()

# Simple debug print to verify it's not localhost
print(f"--- Connecting to: {URI} ---")