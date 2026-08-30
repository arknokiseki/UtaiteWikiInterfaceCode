{{Documentation/Header}}
{{Lua|Formatting}}
This template allows to display formatting methods without them being actually applied to the text for examples and guides.
* For direct template call format use: {{T|T}}
* For direct link format use: {{T|L}}

==Examples==
;Default
{{T|F|Xiao|_Y_=1}}

;Link with label and bolding
{{T|F|p1=Xiao|p2=Alatus|p3=l=1|p4=b=1|_Y_=1}}

;External Link with italic, underline, in ref tags and variable link label
{{T|F|https://youtu.be/mpD8bIM1FLU|element|p3=el=1|p4=i=1|p5=u=1|p6=r=1|p7=vl=1|_Y_=1}}

;Link with variable Input indication and bolding
{{T|F|Xiao|Alatus|p3=l=1|p4=b=1|p5=v=1|_Y_=1}}

;Template formatting with direct input and variable input with named and unnamed params
{{T|F|p1=Icon|p2=p1=alatus=blue|p3=v2=element=blue|p4=p3=azure|p5=v4=potato|p6=t=1|_Y_=1}}

==Template Data==
<templatedata>
{
	"params": {
		"text": {
			"aliases": [
				"1"
			],
			"label": "Text",
			"description": "Main input to display, represents the page to link in link format and the url to link to in external link format.",
			"type": "string",
			"required": true
		},
		"link": {
			"aliases": [
				"l"
			],
			"label": "Link",
			"description": "Option for internal link formatting.",
			"type": "string"
		},
		"external-link": {
			"aliases": [
				"el"
			],
			"label": "External Link",
			"description": "Option for external link formatting.",
			"type": "string"
		},
		"label": {
			"aliases": [
				"2"
			],
			"label": "Label",
			"description": "Functional only with link or external link formatting active, text to add as label.",
			"type": "string"
		},
		"variable": {
			"aliases": [
				"v"
			],
			"label": "Variable Input",
			"description": "Display text as variable input (i.e. expected to be replaced by appropiate text).",
			"type": "string"
		},
		"variable-label": {
			"aliases": [
				"vl"
			],
			"label": "Variable Input",
			"description": "Functional only with link or external link formatting active, display the link lable as variable input (i.e. expected to be replaced by appropiate text).",
			"type": "string"
		},
		"template": {
			"aliases": [
				"t"
			],
			"label": "Template",
			"description": "Option for template call formatting.",
			"type": "string"
		},
		"v#": {
			"label": "Variable Input",
			"description": "Functional only with template call formatting active, parameter to display as variable input (i.e. expected to be replaced by appropiate text).",
			"type": "string"
		},
		"p#": {
			"label": "Fixed Input",
			"description": "Functional only with template call formatting active, parameter to display as fixed input (i.e. expected to be used as-is).",
			"type": "string"
		},
		"bold": {
			"aliases": [
				"b"
			],
			"label": "Bold",
			"description": "Option for bold formatting.",
			"type": "boolean"
		},
		"italic": {
			"aliases": [
				"i"
			],
			"label": "Italic",
			"description": "Option for italic formatting.",
			"type": "boolean"
		},
		"underline": {
			"aliases": [
				"u"
			],
			"label": "Underline",
			"description": "Option for underline formatting.",
			"type": "boolean"
		},
		"ref": {
			"aliases": [
				"r"
			],
			"label": "Ref Tag",
			"description": "Option for adding <ref></ref> tags.",
			"type": "boolean"
		},
		"nowiki": {
			"aliases": [
				"nw"
			],
			"label": "NoWiki",
			"description": "Option for adding <nowiki></nowiki> tags.",
			"type": "boolean"
		}
	},
	"description": "Template for displaying formatting methods as they would show in source editor mode.",
	"paramOrder": [
		"text",
		"link",
		"external-link",
		"label",
		"variable",
		"variable-label",
		"v#",
		"template",
		"p#",
		"bold",
		"italic",
		"underline",
		"ref",
		"nowiki"
	]
}
</templatedata>