# Built from runner/build/ (made by `npm run stage`), never from the repo root,
# so only the files listed in jobs.json "image.include" end up in the image.
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt /app/runner/requirements.txt
RUN pip install --no-cache-dir -r /app/runner/requirements.txt

# SUMO later: RUN apt-get update && apt-get install -y --no-install-recommends sumo sumo-tools && rm -rf /var/lib/apt/lists/*

COPY app/ /app/
COPY jobs.json /app/runner/jobs.json
COPY container/ /app/runner/container/

ENV PYTHONUNBUFFERED=1 JOBS_FILE=/app/runner/jobs.json WORK_DIR=/app
EXPOSE 8080
CMD ["python", "/app/runner/container/server.py"]
