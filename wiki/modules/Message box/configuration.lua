--------------------------------------------------------------------------------
--                          Message box configuration                         --
--                                                                            --
-- This module contains configuration data for [[Module:Message box]].        --
--------------------------------------------------------------------------------

return {
	ambox = {
		types = {
			speedy = {
				class = 'ambox-speedy',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			delete = {
				class = 'ambox-delete',
				image = 'OOjs UI icon alert-destructive.svg'
			},
			warning = { -- alias for content
				class = 'ambox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			content = {
				class = 'ambox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			style = {
				class = 'ambox-style',
				image = 'Edit-clear.svg'
			},
			move = {
				class = 'ambox-move',
				image = 'Merge-split-transwiki default.svg'
			},
			protection = {
				class = 'ambox-protection',
				image = 'Semi-protection-shackle-keyhole.svg'
			},
			notice = {
				class = 'ambox-notice',
				image = 'OOjs UI icon information-progressive.svg'
			}
		},
		default                     = 'notice',
		allowBlankParams            = {'talk', 'sect', 'date', 'issue', 'fix', 'subst', 'hidden'},
		allowSmall                  = true,
		smallParam                  = 'left',
		smallClass                  = 'mbox-small-left',
		substCheck                  = true,
		classes                     = {'metadata', 'plainlinks', 'ambox'},
		imageEmptyCell              = true,
		imageCheckBlank             = true,
		imageSmallSize              = '20x20px',
		imageCellDiv                = true,
		useCollapsibleTextFields    = true,
		imageRightNone              = true,
		sectionDefault              = 'article',
		allowMainspaceCategories    = true,
		templateCategory            = 'Article message templates',
	        templateCategoryRequireName = true,
		templateErrorCategory       = nil,
		templateErrorParamsToCheck  = {'issue', 'fix', 'subst'}
	},
	
	cmbox = {
		types = {
			speedy = {
				class = 'cmbox-speedy',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			delete = {
				class = 'cmbox-delete',
				image = 'OOjs UI icon alert-destructive.svg'
			},
			content = {
				class = 'cmbox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			style = {
				class = 'cmbox-style',
				image = 'Edit-clear.svg'
			},
			move = {
				class = 'cmbox-move',
				image = 'Merge-split-transwiki default.svg'
			},
			protection = {
				class = 'cmbox-protection',
				image = 'Semi-protection-shackle-keyhole.svg'
			},
			notice = {
				class = 'cmbox-notice',
				image = 'OOjs UI icon information-progressive.svg'
			},
			caution = {
				class = 'cmbox-style',
				image = 'Ambox warning yellow.svg'
			}
		},
		default              = 'notice',
		showInvalidTypeError = true,
		classes              = {'plainlinks', 'cmbox'},
		imageEmptyCell       = true
	},
	
	fmbox = {
		types = {
			warning = {
				class = 'fmbox-warning',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			editnotice = {
				class = 'fmbox-editnotice',
				image = 'OOjs UI icon information-progressive.svg'
			},
			system = {
				class = 'fmbox-system',
				image = 'OOjs UI icon information-progressive.svg'
			}
		},
		default              = 'system',
		showInvalidTypeError = true,
		classes              = {'plainlinks', 'fmbox'},
		imageEmptyCell       = false,
		imageRightNone       = false
	},
	
	imbox = {
		types = {
			speedy = {
				class = 'imbox-speedy',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			delete = {
				class = 'imbox-delete',
				image = 'OOjs UI icon alert-destructive.svg'
			},
			content = {
				class = 'imbox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			style = {
				class = 'imbox-style',
				image = 'Edit-clear.svg'
			},
			move = {
				class = 'imbox-move',
				image = 'Merge-split-transwiki default.svg'
			},
			protection = {
				class = 'imbox-protection',
				image = 'Semi-protection-shackle-keyhole.svg'
			},
			license = {
				class = 'imbox-license licensetpl',
				image = 'Imbox-license.svg'
			},
			featured = {
				class = 'imbox-featured',
				image = 'Cscr-featured.svg'
			},
			notice = {
				class = 'imbox-notice',
				image = 'OOjs UI icon information-progressive.svg'
			}
		},
		default              = 'notice',
		showInvalidTypeError = true,
		classes              = {'imbox'},
		usePlainlinksParam   = true,
		imageEmptyCell       = true,
		below                = true,
		templateCategory     = 'File message boxes'
	},
	
	ombox = {
		types = {
			speedy = {
				class = 'ombox-speedy',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			delete = {
				class = 'ombox-delete',
				image = 'OOjs UI icon alert-destructive.svg'
			},
			warning = { -- alias for content
				class = 'ombox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			content = {
				class = 'ombox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			style = {
				class = 'ombox-style',
				image = 'Edit-clear.svg'
			},
			move = {
				class = 'ombox-move',
				image = 'Merge-split-transwiki default.svg'
			},
			protection = {
				class = 'ombox-protection',
				image = 'Semi-protection-shackle-keyhole.svg'
			},
			notice = {
				class = 'ombox-notice',
				image = 'OOjs UI icon information-progressive.svg'
			},
			critical = {
				class = 'mbox-critical',
				image = 'OOjs UI icon clock-destructive.svg'
			}
		},
		default              = 'notice',
		showInvalidTypeError = true,
		classes              = {'plainlinks', 'ombox'},
		allowSmall           = true,
		imageEmptyCell       = true,
		imageRightNone       = true
	},
	
	tmbox = {
		types = {
			speedy = {
				class = 'tmbox-speedy',
				image = 'OOjs UI icon clock-destructive.svg'
			},
			delete = {
				class = 'tmbox-delete',
				image = 'OOjs UI icon alert-destructive.svg'
			},
			content = {
				class = 'tmbox-content',
				image = 'OOjs UI icon notice-warning.svg'
			},
			style = {
				class = 'tmbox-style',
				image = 'Edit-clear.svg'
			},
			move = {
				class = 'tmbox-move',
				image = 'Merge-split-transwiki default.svg'
			},
			protection = {
				class = 'tmbox-protection',
				image = 'Semi-protection-shackle-keyhole.svg'
			},
			notice = {
				class = 'tmbox-notice',
				image = 'OOjs UI icon information-progressive.svg'
			}
		},
		default              = 'notice',
		showInvalidTypeError = true,
		classes              = {'plainlinks', 'tmbox'},
		allowSmall           = true,
		imageRightNone       = true,
		imageEmptyCell       = true,
		imageEmptyCellStyle  = true,
		templateCategory     = 'Talk message boxes'
	}
}