%lex

%%

\s+         /* whitespace */
"if"        return "if";
"then"      return "then";
"else"      return "else";
"for"       return "for";
"not in"    return "notin"
"in"        return "in";
"when"      return "when";
"true"      return "true";
"false"     return "false";
"null"      return "null";
"."         return ".";
","         return ",";
":"         return ":";
"=="        return "==";
"!="        return "!=";
"="         return "=";
"+"         return "+";
"-"         return "-";
"*"         return "*";
"/"         return "/";
"<"         return "<";
"<="            return "<=";
">"         return ">";
">="            return ">=";
"&&"           return "&&";
"||"           return "||";
"!"         return "!";
"("         return "(";
")"         return ")";
"["         return "[";
"]"         return "]";
"{"         return "{";
"}"         return "}";


[a-zA-Z_]\w* return 'ID';
\"[^\"\n]*\" return 'STR';
[0-9]+("."[0-9]+)?\b  return 'NUM';
<<EOF>>     return "EOF";

/lex

%left '||'
%left '&&'
%left '==' '!='
%left '<' '<=' '>' '>=' 'in' 'notin'
%left '+' '-'
%left '*' '/'
%right '!'
%right NEG
%left '.' '{'
%left '['
%left '('
%nonassoc 'then'
%nonassoc 'else'


%start n_expr

%%


n_expr: EOF  { return new ast.Literal(null, new ast.Loc(this._$)); }
      | expr EOF { return $1; }
;

expr : null    { $$ = new ast.Literal(null, new ast.Loc(this._$)); }
     | NUM     { $$ = new ast.Literal(Number(yytext), new ast.Loc(this._$)); }
     | true    { $$ = new ast.Literal(true, new ast.Loc(this._$)); }
     | false   { $$ = new ast.Literal(false, new ast.Loc(this._$)); }
     | STR     { $$ = new ast.Literal(yytext.substring(1, yytext.length-1), new ast.Loc(this._$)); }
     | ID      { $$ = new ast.Identifier(yytext, new ast.Loc(this._$)); }
     
     | expr '+' expr  { $$ = new ast.Binary("+", $1, $3, new ast.Loc(this._$)); }
     | expr '-' expr  { $$ = new ast.Binary("-", $1, $3, new ast.Loc(this._$)); }
     | expr '*' expr  { $$ = new ast.Binary("*", $1, $3, new ast.Loc(this._$)); }
     | expr '/' expr  { $$ = new ast.Binary("/", $1, $3, new ast.Loc(this._$)); }
     | expr '&&' expr { $$ = new ast.Binary("&&", $1, $3, new ast.Loc(this._$)); }
     | expr '||' expr { $$ = new ast.Binary("||", $1, $3, new ast.Loc(this._$)); }
     | expr '<' expr  { $$ = new ast.Binary("<", $1, $3, new ast.Loc(this._$)); }
     | expr '<=' expr { $$ = new ast.Binary("<=", $1, $3, new ast.Loc(this._$)); }
     | expr '>' expr  { $$ = new ast.Binary(">", $1, $3, new ast.Loc(this._$)); }
     | expr '>=' expr { $$ = new ast.Binary(">=", $1, $3, new ast.Loc(this._$)); }
     | expr '==' expr { $$ = new ast.Binary("==", $1, $3, new ast.Loc(this._$)); }
     | expr '!=' expr { $$ = new ast.Binary("!=", $1, $3, new ast.Loc(this._$)); }
     | expr 'in' expr { $$ = new ast.Binary("in", $1, $3, new ast.Loc(this._$)); }
     | expr 'notin' expr { $$ = new ast.Binary("not in", $1, $3, new ast.Loc(this._$)); }
     | '-' expr %prec NEG { $$ = new ast.Unary("-", $2, new ast.Loc(this._$)); }
     | '!' expr { $$ = new ast.Unary("!", $2, new ast.Loc(this._$)); }
     | '(' expr ')' { $$ = $2; }

     | '[' n_list_els ']' { $$ = new ast.List($2, new ast.Loc(this._$)); }
     | '{' n_tuple_els '}' { $$ = new ast.Tuple($2, new ast.Loc(this._$)); }

     | 'if' expr 'then' expr 'else' expr { $$ = new ast.IfThenElse($2, $4, $6, new ast.Loc(this._$)); }

     | expr '.' ID { $$ = new ast.Select($1,$3, new ast.Loc(this._$)); }
     | expr '.' NUM { $$ = new ast.Select($1, $3, new ast.Loc(this._$)); }
     | expr '{' proj_els '}' { $$ = new ast.Project($1, $3, new ast.Loc(this._$)); }
     | '{' expr 'for' for_els 'when' expr '}' { $$ = new ast.Generate($2, $4, $6, new ast.Loc(this._$)); }
     | '{' expr 'for' for_els '}' { $$ = new ast.Generate($2,$4, true, new ast.Loc(this._$)); }
     | expr '[' expr ']' { $$ = new ast.Filter($1, $3, new ast.Loc(this._$)); }

     | ID '(' n_list_els ')' { $$ = new ast.Call($1, $3, new ast.Loc(this._$)); }
;

n_list_els : /* empty */ { $$ = [] }
           | list_els  { $$ = $1 }
;

list_els: expr                { $$ = [$1] }
        | expr ',' list_els   { $$ = $3; $$.unshift($1); }
;

n_tuple_els: /* empty */ { $$ = {} }
           | tuple_els   { $$ = $1 }
;

tuple_els: ID ':' expr                 { $$ = {}; $$[$1] = $3; }
         | ID ':' expr ',' tuple_els   { $$ = $5; $$[$1] = $3; }
;

proj_els: id_proj_els  { $$ = $1 }
        | num_proj_els { $$ = $1 }
;

id_proj_els: ID                 { $$ = [$1]; }
           | ID ',' id_proj_els { $$ = $3; $$.unshift($1); }
;

num_proj_els: NUM                  { $$ = [Number($1)]; }
            | NUM ',' num_proj_els { $$ = $3; $$.unshift(Number($1)); }
;

for_els: ID 'in' expr { $$ = {}; $$[$1] = $3; }
       | ID 'in' expr ',' for_els { $$ = $5; $$[$1] = $3; }
;
%%

var ast = require("./ast");

exports.parseCell = function(src, cell) {
    var ast = exports.parse(src);
    ast.visitAll(function(n) { n.loc.cell = cell });
    return ast;
};