
count:
	find . -name '*.ts*' \
			| grep -v node_modules/ \
			| grep -v spec. \
			| grep -v test. \
			| grep -v test-pages/ \
			| grep -v test/ \
			| xargs wc -l | sort -rn | less
