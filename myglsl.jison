/* NOTICE This parser is based directly upon the token / grammar specification for GLSL ES 1.0.17
 * by the Khronos Group available at http://www.khronos.org/registry/gles/specs/2.0/GLSL_ES_Specification_1.0.17.pdf
 */

/* ~~~~~~~ Token Defns ~~~~~~~~ */

%lex

%%
\s+		/* whitespace */
'__colour__annotation' return 'COLOUR';
'__range__annotation' return 'RANGE';
'attribute'	return 'ATTRIBUTE';
'const'		return 'CONST';
'bool'		return 'BOOL';
'float' 	return 'FLOAT';
'int'		return 'INT';
'break'		return 'BREAK';
'continue'	return 'CONTINUE';
'do'		return 'DO';
'else'		return 'ELSE';
'for'		return 'FOR';
'if'		return 'IF';
'discard'	return 'DISCARD';
'return'	return 'RETURN';
'bvec2'		return 'BVEC2';
'bvec3'		return 'BVEC3';
'bvec4'		return 'BVEC4';
'ivec2'		return 'IVEC2';
'ivec3'		return 'IVEC3';
'ivec4'		return 'IVEC4';
'vec2'		return 'VEC2';
'vec3'		return 'VEC3';
'vec4'		return 'VEC4';
'mat2'		return 'MAT2';
'mat3'		return 'MAT3';
'mat4'		return 'MAT4';
'in'		return 'IN';
'out'		return 'OUT';
'inout'		return 'INOUT';
'uniform'	return 'UNIFORM';
'varying'	return 'VARYING';
'sampler2D'	return 'SAMPLER2D';
'samplercube'	return 'SAMPLERCUBE';
'struct'	return 'STRUCT';
'void'		return 'VOID';
'while'		return 'WHILE';
'invariant' return 'INVARIANT';
'highp' return 'HIGH_PRECISION';
'mediump' return 'MEDIUM_PRECISION';
'lowp' return 'LOW_PRECISION';
'precision' return 'PRECISION'; /*'magic_type_name'  return 'TYPE_NAME';*/
'field_selection' return 'FIELD_SELECTION';
'<<' return 'LEFT_OP';
'>>' return 'RIGHT_OP';
'++' return 'INC_OP';
'--' return 'DEC_OP';
'<=' return 'LE_OP';
'>=' return 'GE_OP';
'==' return 'EQ_OP';
'!=' return 'NE_OP';
'&&' return 'AND_OP';
'||' return 'OR_OP'; /* '^^' XOR_OP TODO: is this valid? */
'*=' return 'MUL_ASSIGN';
'/=' return 'DIV_ASSIGN';
'+=' return 'ADD_ASSIGN';
'%=' return 'MOD_ASSIGN'; /* reserved LEFT_ASSIGN RIGHT_ASSIGN AND_ASSIGN XOR_ASSIGN OR_ASSIGN */
'-=' return 'SUB_ASSIGN';
'(' return 'LEFT_PAREN';
')' return 'RIGHT_PAREN';
'[' return 'LEFT_BRACKET';
']' return 'RIGHT_BRACKET';
'{' return 'LEFT_BRACE';
'}' return 'RIGHT_BRACE';
'.' return 'DOT';
',' return 'COMMA';
':' return 'COLON';
'=' return 'EQUAL';
';' return 'SEMICOLON';
'!' return 'BANG';
'-' return 'DASH';
'~' return 'TILDE';
'+' return 'PLUS';
'*' return 'STAR';
'/' return 'SLASH';
'%' return 'PERCENT';
'<' return 'LEFT_ANGLE';
'>' return 'RIGHT_ANGLE';
'|' return 'VERTICAL_BAR';
'^' return 'CARET';
'&' return 'AMPERSAND';
'?' return 'QUESTION';
'true' return 'BOOLCONSTANT';
'false' return 'BOOLCONSTANT';
[a-zA-Z\_]+[a-zA-Z0-9]* return 'IDENTIFIER'; /* identifiers of the form identifier : nondigit | identifier nondigit | identifier digit */
([0-9]+'.'[0-9]+|[0-9]+'.'|'.'[0-9]+)(('e'|'E')('+'|'-')?[0-9]+)?|[0-9]+('e'|'E')('+'|'-')?[0-9]+ return 'FLOATCONSTANT'; /* float constants (conveniently the same format as accepted by parseFloat) floating-constant : fractional-constant [exponent-part] | digit-sequence exponent-part */
[1-9][0-9]*|'0'[0-7]+|'0'('x'|'X')[0-9a-fA-F]+|'0' return 'INTCONSTANT'; /* integer constants (same as parseInt) integer-constant : decimal-constant | octal-constant | hexadecimal-constant */
<<EOF>> return 'EOF';

/lex

%start expressions

%% /* ~~~~~~~~~ Grammar ~~~~~~~~~ */



expressions:
        statement_list EOF;

variable_identifier:
        IDENTIFIER { $$ = yy.addVariableReference(@1, $1); }
	;

primary_expression:
	variable_identifier { log('variable identifier'); }
        | INTCONSTANT { $$ = new yy.Integer(@1, @1, $1); }
        | FLOATCONSTANT { $$ = new yy.Float(@1, @1, $1); }
        | BOOLCONSTANT { $$ = new yy.Boolean(@1, @1, $1); }
        | LEFT_PAREN expression RIGHT_PAREN
	;

postfix_expression:
        primary_expression { log('primary expression'); }
        | postfix_expression LEFT_BRACKET integer_expression RIGHT_BRACKET { log('postfix'); $$ = new yy.Expression(@1, @4, $3); }
        | function_call { log('function call'); }
        | postfix_expression DOT IDENTIFIER { $$ = new yy.VariableElementRef(@1, @3, $1, $3); }
        | postfix_expression INC_OP { $$ = new yy.Expression(@1, @2, $1); }
        | postfix_expression DEC_OP { $$ = new yy.Expression(@1, @2, $1); }
	;

integer_expression:
        expression
	;

function_call:
        function_call_generic { $$ = $1; $$.updateLocation(@1); }
	;

function_call_generic:
        function_call_header_with_parameters RIGHT_PAREN { $$ = $1; }
        | function_call_header_no_parameters RIGHT_PAREN { $$ = $1; }
	;

function_call_header_no_parameters:
        function_call_header VOID
        | function_call_header
	;

function_call_header_with_parameters:
        function_call_header assignment_expression { log('function call header assignment expression'); $$ = $1; $$.addArgument($2); }
        | function_call_header_with_parameters COMMA assignment_expression { $$ = $1; $$.addArgument($3); }
	;

function_call_header:
        constructor_identifier LEFT_PAREN { $$ = yy.addFunctionCall(@1, $1); }
        | IDENTIFIER LEFT_PAREN { $$ = yy.addFunctionCall(@1, $1); }
	;

constructor_identifier:
        FLOAT
        | INT
        | BOOL
        | VEC2
        | VEC3
        | VEC4
        | BVEC2
        | BVEC3
        | BVEC4
        | IVEC2
        | IVEC3
        | IVEC4
        | MAT2
        | MAT3
        | MAT4
/*	| IDENTIFIER { if (!lexer.structs[$1]) yyerror(); }  TYPE_NAME */
	| TYPE_NAME
	;

unary_expression:
        postfix_expression
        | INC_OP unary_expression { $$ = new yy.Expression(@1, @2, $2); }
        | DEC_OP unary_expression { $$ = new yy.Expression(@1, @2, $2); }
        | unary_operator unary_expression { $$ = new yy.Expression(@1, @2, $2); }
	;

unary_operator:
        PLUS
        | DASH
        | BANG
        | TILDE
	;

multiplicative_expression:
        unary_expression
        | multiplicative_expression STAR unary_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | multiplicative_expression SLASH unary_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | multiplicative_expression PERCENT unary_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

additive_expression:
        multiplicative_expression
        | additive_expression PLUS multiplicative_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | additive_expression DASH multiplicative_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

shift_expression:
        additive_expression
        | shift_expression LEFT_OP additive_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | shift_expression RIGHT_OP additive_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

relational_expression:
        shift_expression
        | relational_expression LEFT_ANGLE shift_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | relational_expression RIGHT_ANGLE shift_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | relational_expression LE_OP shift_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | relational_expression GE_OP shift_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

equality_expression:
        relational_expression
        | equality_expression EQ_OP relational_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
        | equality_expression NE_OP relational_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

and_expression:
        equality_expression
        | and_expression AMPERSAND equality_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

exclusive_or_expression:
        and_expression
        | exclusive_or_expression CARET and_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

inclusive_or_expression:
        exclusive_or_expression
        | inclusive_or_expression VERTICAL_BAR exclusive_or_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

logical_and_expression:
        inclusive_or_expression
        | logical_and_expression AND_OP inclusive_or_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

/* No operator defined!
logical_xor_expression:
        logical_and_expression
        | logical_xor_expression XOR_OP logical_and_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;
*/

logical_or_expression:
        /* logical_xor_expression Not used */
	logical_and_expression
        | logical_or_expression OR_OP logical_and_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

conditional_expression:
        logical_or_expression
        | logical_or_expression QUESTION expression COLON assignment_expression { $$ = new yy.Expression(@1, @5, $1, $3, $5); }
	;

assignment_expression:
        conditional_expression
        | unary_expression assignment_operator assignment_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

assignment_operator:
        EQUAL
        | MUL_ASSIGN
        | DIV_ASSIGN
        | MOD_ASSIGN
        | ADD_ASSIGN
        | SUB_ASSIGN
/*      | LEFT_ASSIGN  Reserved
        | RIGHT_ASSIGN
        | AND_ASSIGN
        | XOR_ASSIGN
        | OR_ASSIGN */
	;

expression:
        assignment_expression
        | expression COMMA assignment_expression { $$ = new yy.Expression(@1, @3, $1, $3); }
	;

constant_expression:
        conditional_expression
	;

declaration:
        function_prototype SEMICOLON { $$ = $1; $$.updateLocation(@1, @2); }
        | init_declarator_list SEMICOLON
        | PRECISION precision_qualifier type_specifier_no_prec SEMICOLON
	;

function_prototype:
        function_declarator RIGHT_PAREN
	;

function_declarator:
        function_header
        | function_header_with_parameters
	;

function_header_with_parameters:
        function_header parameter_declaration { $$ = $1; $$.addParameter($2); }
        | function_header_with_parameters COMMA parameter_declaration { $$ = $1; $$.addParameter($3); }
	;

function_header:
        fully_specified_type IDENTIFIER LEFT_PAREN { $$ = new yy.Function(@1, @3, $2, @2); }
	;

parameter_declarator:
        type_specifier IDENTIFIER { $$ = new yy.Variable(@1, @2, $1, @1); }
        | type_specifier IDENTIFIER LEFT_BRACKET constant_expression RIGHT_BRACKET { $$ = new yy.Variable(@1, @2, $1, @1); }
	;

parameter_declaration:
        type_qualifier parameter_qualifier parameter_declarator { $$ = $3; }
        | parameter_qualifier parameter_declarator { $$ = $2; }
        | type_qualifier parameter_qualifier parameter_type_specifier
        | parameter_qualifier parameter_type_specifier
	;

parameter_qualifier:
        /* empty */
        | IN
        | OUT
        | INOUT
	;

parameter_type_specifier:
        type_specifier
        | type_specifier LEFT_BRACKET constant_expression RIGHT_BRACKET
	;

init_declarator_list_unannotated:
        single_declaration
        | init_declarator_list_unannotated COMMA IDENTIFIER
        | init_declarator_list_unannotated COMMA IDENTIFIER LEFT_BRACKET constant_expression RIGHT_BRACKET
        | init_declarator_list_unannotated COMMA IDENTIFIER EQUAL initializer
	;

init_declarator_list:
	init_declarator_list_unannotated
	| init_declarator_list_unannotated COLOUR
	| init_declarator_list_unannotated RANGE INTCONSTANT COMMA INTCONSTANT
	;

single_declaration:
        fully_specified_type
        | fully_specified_type IDENTIFIER { $$ = new yy.Variable(@1, @2, $2, @2); }
        | fully_specified_type IDENTIFIER LEFT_BRACKET constant_expression RIGHT_BRACKET { $$ = new yy.Variable(@1, @2, $2, @2); }
        | fully_specified_type IDENTIFIER EQUAL initializer { $$ = new yy.Variable(@1, @2, $2, @2); }
        | INVARIANT IDENTIFIER  /* Vertex only. */
	;

fully_specified_type:
        type_specifier
        | type_qualifier type_specifier
	;

type_qualifier:
        CONST
        | ATTRIBUTE   /* Vertex only. */
        | VARYING
        | INVARIANT VARYING
        | UNIFORM
	;

type_specifier:
        type_specifier_no_prec
        | precision_qualifier type_specifier_no_prec
	;

type_specifier_no_prec:
        VOID
        | FLOAT
        | INT
        | BOOL
        | VEC2
        | VEC3
        | VEC4
        | BVEC2
        | BVEC3
        | BVEC4
        | IVEC2
        | IVEC3
        | IVEC4
        | MAT2
        | MAT3
        | MAT4
        | SAMPLER2D
        | SAMPLERCUBE
        | struct_specifier
//        | IDENTIFIER { if (!yy.structs[$1]) yy.errors.push("Struct not found"); } /* TYPE_NAME */
        | TYPE_NAME
	;

precision_qualifier:
        HIGH_PRECISION
        | MEDIUM_PRECISION
        | LOW_PRECISION
	;

struct_specifier:
        STRUCT IDENTIFIER LEFT_BRACE struct_declaration_list RIGHT_BRACE {
	  lexer.rules[36] = new RegExp(lexer.rules[36].toString().slice(1,-3).toString() + "\\b|^" + $2 + "\\b");
	  $$ = {struct:true,body:$4};
	  yy.structs[$2] = $4;
	}
        | STRUCT LEFT_BRACE struct_declaration_list RIGHT_BRACE {
	  $$ = $3;
	}
	;

struct_declaration_list:
        struct_declaration {
          $$ = {};
	  for (i=0; i<$1.list.length; i++) {
	    $$[$1.list[i].id] = $1.type;
	    if ($1.list[i])  $$[$1.list[i].id].n = $1.list[i].n;
          }
	}
        | struct_declaration_list struct_declaration {
	  for (i=0; i<$2.list.length; i++) {
	    $1[$2.list[i].id] = $2.type;
	    if ($2.list[i])  $$[$2.list[i].id].n = $2.list[i].n
          }
	  $$ = $1;
	}	;

struct_declaration:
        type_specifier struct_declarator_list SEMICOLON { $$ = {type:$1,list:$2}; }
	;

struct_declarator_list:
        struct_declarator { $$ = [$1]; }
        | struct_declarator_list COMMA struct_declarator { $$ = $1.concat([$3]); }
	;

struct_declarator:
        IDENTIFIER { $$ = {id:$1}; }
        | IDENTIFIER LEFT_BRACKET constant_expression RIGHT_BRACKET { $$ = {id:$1,n:$3}; }
	;

initializer:
        assignment_expression
	;

declaration_statement:
        declaration
	;

statement_no_new_scope:
        compound_statement_with_scope
        | simple_statement
	;

simple_statement:
        declaration_statement
        | expression_statement
        | selection_statement
        | iteration_statement
        | jump_statement
	;

left_brace:
        LEFT_BRACE { yy.pushContext(); }
        ;

right_brace:
        RIGHT_BRACE { yy.popContext(); }
        ;

compound_statement_with_scope:
        LEFT_BRACE RIGHT_BRACE
        | left_brace statement_list right_brace
	;

statement_with_scope:
        compound_statement_no_new_scope
        | simple_statement
	;

compound_statement_no_new_scope:
        LEFT_BRACE RIGHT_BRACE
        | left_brace statement_list right_brace
	;

statement_list:
        statement_no_new_scope
        | statement_list statement_no_new_scope
	;

expression_statement:
        SEMICOLON
        | expression SEMICOLON
	;

selection_statement:
        IF LEFT_PAREN expression RIGHT_PAREN selection_rest_statement
	;

selection_rest_statement:
        statement_with_scope ELSE statement_with_scope
        | statement_with_scope
	;

condition:
        expression
        | fully_specified_type IDENTIFIER EQUAL initializer { $$ = new yy.Variable(@1, @2, $2, @2); }
	;

iteration_statement:
        WHILE LEFT_PAREN condition RIGHT_PAREN statement_no_new_scope
        | DO statement_with_scope WHILE LEFT_PAREN expression RIGHT_PAREN SEMICOLON
        | FOR LEFT_PAREN for_init_statement for_rest_statement RIGHT_PAREN statement_no_new_scope
	;

for_init_statement:
        expression_statement
        | declaration_statement
	;

conditionopt:
        /* empty */
	| condition
	;

for_rest_statement:
        conditionopt SEMICOLON
        | conditionopt SEMICOLON expression
	;

jump_statement:
        CONTINUE SEMICOLON
        | BREAK SEMICOLON
        | RETURN SEMICOLON
        | RETURN expression SEMICOLON
        | DISCARD SEMICOLON   /* Fragment shader only. */
	;

translation_unit:
        external_declaration
        | translation_unit external_declaration
	;

external_declaration:
        function_definition
        | declaration;

function_definition:
        function_prototype compound_statement_no_new_scope
	;
