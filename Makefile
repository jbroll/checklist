
count:
	find . -name '*.ts*' \
			| grep -v node_modules/ \
			| grep -v spec. \
			| grep -v test. \
			| grep -v test-pages/ \
			| grep -v test/ \
			| xargs wc -l | sort -rn | less

icons: public/bubblelist.svg
	convert public/bubblelist.svg -resize 512x512 public/icon-512.png
	convert public/bubblelist.svg -resize 192x192 public/icon-192.png
	convert public/bubblelist.svg -resize 180x180 public/apple-touch-icon.png
	convert public/bubblelist.svg -resize 512x512 bubblelist.png
	convert public/bubblelist.svg -resize 512x512 -background white -flatten public/icon-512-maskable.png
	convert public/bubblelist.svg -resize 192x192 -background white -flatten public/icon-192-maskable.png
