FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/engine TZ=America/New_York
COPY engine/requirements.txt engine/requirements.txt
RUN pip install --no-cache-dir -r engine/requirements.txt
COPY engine engine
COPY config config
COPY data data
RUN mkdir -p out
CMD ["python", "-m", "letf", "serve"]
