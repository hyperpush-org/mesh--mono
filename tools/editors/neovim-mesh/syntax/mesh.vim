if exists('b:current_syntax')
  finish
endif

syntax case match
syntax sync fromstart

syntax cluster meshTop contains=meshDocModuleComment,meshDocComment,meshComment,meshCommentBlock,meshRegex,meshAtom,meshStringTriple,meshStringDouble,meshNumberHex,meshNumberBinary,meshNumberOctal,meshNumberFloat,meshNumberInteger,meshClusterDecorator,meshModuleCall,meshModuleAccessor,meshModuleFunctionCall,meshControlKeyword,meshDeclarationKeyword,meshWordOperator,meshBoolean,meshBuiltinType,meshBuiltinConstructor,meshType,meshRangeOperator,meshDiamondOperator,meshConcatOperator,meshFatArrowOperator,meshTryOperator,meshLogicalAndOperator,meshLogicalOrOperator,meshPipeOperator,meshArrowOperator,meshAnnotationOperator,meshComparisonOperator,meshArithmeticOperator,meshAssignmentOperator,meshFunctionDeclaration,meshFunctionName,meshVariable

syntax match meshDocModuleComment /##!.*$/
syntax match meshDocComment /##[^!].*$/
syntax match meshDocComment /##$/
syntax match meshComment /#[^#=].*$/
syntax match meshComment /#$/
syntax region meshCommentBlock start=/#=/ end=/=#/ keepend

syntax match meshStringEscape /\\./ contained
syntax region meshInterpolation matchgroup=meshInterpolationDelimiter start=/#{/ end=/}/ keepend contained contains=meshInterpolationBrace,@meshTop
syntax region meshInterpolation matchgroup=meshInterpolationDelimiter start=/\${/ end=/}/ keepend contained contains=meshInterpolationBrace,@meshTop
syntax region meshInterpolationBrace matchgroup=meshInterpolationDelimiter start=/{/ end=/}/ keepend contained contains=meshInterpolationBrace,@meshTop
syntax region meshStringTriple start=/"""/ end=/"""/ keepend contains=meshStringEscape,meshInterpolation
syntax region meshStringDouble start=/\%("\)\@<!"\%("\)\@!/ skip=/\\\\\|\\"/ end=/\%("\)\@<!"\%("\)\@!/ keepend contains=meshStringEscape,meshInterpolation

syntax match meshNumberHex /\<0[xX][0-9a-fA-F_]\+\>/
syntax match meshNumberBinary /\<0[bB][01_]\+\>/
syntax match meshNumberOctal /\<0[oO][0-7_]\+\>/
syntax match meshNumberFloat /\v<[0-9][0-9_]*(\.[0-9][0-9_]*)?[eE][+-]?[0-9_]+>/
syntax match meshNumberFloat /\v<[0-9][0-9_]*\.[0-9][0-9_]*>/
syntax match meshNumberInteger /\<[0-9][0-9_]*\>/
syntax match meshClusterDecorator /@cluster\>/

syntax match meshRegex +\~r/[^/\r\n]*/[ims]*+
syntax match meshAtom /:[a-zA-Z_][a-zA-Z0-9_]*/

syntax match meshModuleCall /\<[A-Z][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\ze\s*(/
syntax match meshModuleAccessor /\./ containedin=meshModuleCall
syntax match meshModuleFunctionCall /\<[A-Z][a-zA-Z0-9_]*\.\zs[a-zA-Z_][a-zA-Z0-9_]*\ze\s*(/

syntax match meshControlKeyword /\<(if\|else\|case\|match\|when\|do\|end\|return\|from\|import\|for\|while\|cond\|break\|continue)\>/
syntax match meshDeclarationKeyword /\<(fn\|let\|def\|type\|struct\|module\|interface\|impl\|pub\|actor\|service\|supervisor\|call\|cast\|trait\|alias\|json)\>/
syntax match meshWordOperator /\<(and\|or\|not\|in\|where\|with\|as\|spawn\|send\|receive\|self\|link\|monitor\|terminate\|trap\|after)\>/
syntax match meshBoolean /\<(true\|false\|nil)\>/
syntax match meshBuiltinType /\<(Int\|Float\|String\|Bool\|Unit\|Pid\|Option\|Result\|List\|Map\|Set\|Queue\|Json)\>/
syntax match meshBuiltinConstructor /\<(Some\|None\|Ok\|Err)\>/
syntax match meshType /\<[A-Z][a-zA-Z0-9_]*\>/

syntax match meshRangeOperator /\.\./
syntax match meshDiamondOperator /\V<>/
syntax match meshConcatOperator /\V++/
syntax match meshFatArrowOperator /\V=>/
syntax match meshTryOperator /\V?/
syntax match meshLogicalAndOperator /\V&&/
syntax match meshLogicalOrOperator /\V||/
syntax match meshPipeOperator /\v\|[0-9]*>/
syntax match meshArrowOperator /\V->/
syntax match meshAnnotationOperator /\V::/
syntax match meshComparisonOperator /==\|!=\|<=\|>=\|<\|>/
syntax match meshArithmeticOperator /\V+\|-\|*\|\/\|%/
syntax match meshAssignmentOperator /=/

syntax match meshFunctionDeclaration /\<(fn\|def)\>\s\+[a-zA-Z_][a-zA-Z0-9_]*/ contains=meshDeclarationKeyword,meshFunctionName
syntax match meshFunctionName /\<(fn\|def)\>\s\+\zs[a-zA-Z_][a-zA-Z0-9_]*/ contained
syntax match meshVariable /\<[a-z_][a-zA-Z0-9_]*\>/

highlight default link meshDocModuleComment SpecialComment
highlight default link meshDocComment SpecialComment
highlight default link meshComment Comment
highlight default link meshCommentBlock Comment
highlight default link meshStringTriple String
highlight default link meshStringDouble String
highlight default link meshStringEscape SpecialChar
highlight default link meshInterpolation Special
highlight default link meshInterpolationDelimiter Delimiter
highlight default link meshNumberHex Number
highlight default link meshNumberBinary Number
highlight default link meshNumberOctal Number
highlight default link meshNumberFloat Float
highlight default link meshNumberInteger Number
highlight default link meshClusterDecorator PreProc
highlight default link meshRegex String
highlight default link meshAtom Constant
highlight default link meshModuleCall Identifier
highlight default link meshModuleAccessor Delimiter
highlight default link meshModuleFunctionCall Function
highlight default link meshControlKeyword Conditional
highlight default link meshDeclarationKeyword Keyword
highlight default link meshWordOperator Operator
highlight default link meshBoolean Boolean
highlight default link meshBuiltinType Type
highlight default link meshBuiltinConstructor Function
highlight default link meshType Type
highlight default link meshRangeOperator Operator
highlight default link meshDiamondOperator Operator
highlight default link meshConcatOperator Operator
highlight default link meshFatArrowOperator Operator
highlight default link meshTryOperator Operator
highlight default link meshLogicalAndOperator Operator
highlight default link meshLogicalOrOperator Operator
highlight default link meshPipeOperator Operator
highlight default link meshArrowOperator Operator
highlight default link meshAnnotationOperator Operator
highlight default link meshComparisonOperator Operator
highlight default link meshArithmeticOperator Operator
highlight default link meshAssignmentOperator Operator
highlight default link meshFunctionDeclaration Function
highlight default link meshFunctionName Function
highlight default link meshVariable Identifier

let b:current_syntax = 'mesh'
