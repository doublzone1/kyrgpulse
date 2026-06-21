#!/bin/bash
set -e

echo "KyrgPulse: starting Docker Compose..."
docker compose up --build -d

echo ""
docker compose ps

echo ""
echo "Ready:"
echo "  Dashboard: http://localhost:3000/dashboard"
echo "  Frontend:  http://localhost:3000"
echo "  Swagger:   http://localhost:8000/docs"
echo ""
echo "To load listings, run:"
echo "  docker exec -it kyrgpulse-backend python -m parsers.lalafo_parser"
echo "  docker exec -it kyrgpulse-backend python -m processors.data_processor"
