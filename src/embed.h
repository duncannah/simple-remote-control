#ifndef EMBED_H
#define EMBED_H

static const unsigned char template_start_html[] = {
#embed "../assets/template_start.html"
	, 0};

static const unsigned char template_end_html[] = {
#embed "../assets/template_end.html"
	, 0};

static const unsigned char main_html[] = {
#embed "../assets/main.html"
	, 0};

#endif	// EMBED_H