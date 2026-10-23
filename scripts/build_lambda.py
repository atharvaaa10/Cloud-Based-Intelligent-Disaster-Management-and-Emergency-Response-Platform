"""
Build script to package the Disaster Triage AWS Lambda function into lambda.zip.
Includes lambda_function.py and the shared triage.py scoring module.

Usage:
  python scripts/build_lambda.py
"""

import os
import sys
import zipfile

def build_lambda_zip():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    lambda_dir = os.path.join(repo_root, "lambda")
    output_zip = os.path.join(lambda_dir, "lambda.zip")

    files_to_pack = [
        ("lambda_function.py", os.path.join(lambda_dir, "lambda_function.py")),
        ("triage.py", os.path.join(lambda_dir, "triage.py")),
    ]

    print(f"Building Lambda package: {output_zip}")
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, filepath in files_to_pack:
            if not os.path.exists(filepath):
                print(f"[ERROR] Required file not found: {filepath}", file=sys.stderr)
                sys.exit(1)
            print(f"  + Adding {arcname} ({os.path.getsize(filepath)} bytes)")
            zf.write(filepath, arcname=arcname)

    zip_size_kb = os.path.getsize(output_zip) / 1024
    print(f"[SUCCESS] Packaged {output_zip} ({zip_size_kb:.2f} KB)")
    print("\nNext steps for AWS deployment:")
    print("  1. Upload zip to your S3 storage bucket:")
    print("     aws s3 cp lambda/lambda.zip s3://<YOUR_STORAGE_BUCKET>/lambda.zip")
    print("  2. Deploy infra/lambda.yaml with LambdaCodeS3Bucket=<YOUR_STORAGE_BUCKET>")

if __name__ == "__main__":
    build_lambda_zip()
