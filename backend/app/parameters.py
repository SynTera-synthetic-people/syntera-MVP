import boto3
import os

parameters = {}

def load_ssm_parameters(path="/app/staging/"):
    ssm = boto3.client("ssm", region_name="ap-south-1")
    paginator = ssm.get_paginator("get_parameters_by_path")

    for page in paginator.paginate(Path=path, WithDecryption=True):
        for param in page["Parameters"]:
            parameters[param["Name"]] = param["Value"].strip()

    for key, value in parameters.items():
        env_key = key.split("/")[-1]
        os.environ[env_key] = value

    
    db = os.environ.get("DATABASE_URL", "")
    if db:
        hostpart = db.split("@")[-1].split("/")[0] if "@" in db else "unknown"
        print("DATABASE_URL host:", hostpart)
        print("DATABASE_URL has ssl flag:", ("ssl=require" in db) or ("sslmode=require" in db))

load_ssm_parameters()
