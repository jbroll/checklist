.PHONY: setup install install-frontend install-backend deploy count icons

# Setup targets
setup: install
	@echo "Setup complete. Run 'make deploy' to deploy."

install: install-frontend install-backend
	@echo "All dependencies installed."

install-frontend:
	npm install --legacy-peer-deps

install-backend:
	cd backend && npm install --legacy-peer-deps

# Deployment
deploy:
	./deploy-full.sh

deploy-update:
	./deploy-full.sh update

deploy-init:
	./deploy-full.sh init

# Utilities
count:
	find src -name '*.ts*' \
			| grep -v "\.test\." \
			| xargs wc -l | sort -rn | less

icons: public/bubblelist.svg
	convert public/bubblelist.svg -resize 512x512 public/icon-512.png
	convert public/bubblelist.svg -resize 192x192 public/icon-192.png
	convert public/bubblelist.svg -resize 180x180 public/apple-touch-icon.png
	convert public/bubblelist.svg -resize 512x512 bubblelist.png
	convert public/bubblelist.svg -resize 512x512 -background white -flatten public/icon-512-maskable.png
	convert public/bubblelist.svg -resize 192x192 -background white -flatten public/icon-192-maskable.png
