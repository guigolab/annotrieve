# Use a modern Python base image
FROM python:3.10-slim-bullseye

# Set environment variables to prevent interactive prompts
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    zlib1g-dev \
    libbz2-dev \
    liblzma-dev \
    tabix \
    && rm -rf /var/lib/apt/lists/*

# Download and install NCBI datasets CLI
RUN curl -o datasets 'https://ftp.ncbi.nlm.nih.gov/pub/datasets/command-line/v2/linux-amd64/datasets' && \
    chmod +x datasets && \
    mv datasets /usr/local/bin/

ARG USER_ID=1000
ARG GROUP_ID=1000

# Echo the user and group ids
RUN echo "USER_ID: $USER_ID" && \
    echo "GROUP_ID: $GROUP_ID"

# Create a non-root user for security with specific UID/GID
RUN groupadd -g ${GROUP_ID} appuser && \
    useradd --create-home --shell /bin/bash -u ${USER_ID} -g ${GROUP_ID} appuser && \
    chown -R appuser:appuser /home/appuser

WORKDIR /home/appuser/app

# Copy and install Python dependencies first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Change ownership to the non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 5000

# Run the application with Gunicorn and Uvicorn workers for production
# In development, this is overridden by docker-compose command
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "3600", "--access-logfile", "-", "--error-logfile", "-", "main:app"] 