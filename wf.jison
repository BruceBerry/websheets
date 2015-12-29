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

     | '[' list_els ']' { $$ = new ast.List($2, new ast.Loc(this._$)); }
     | '{' tuple_els '}' { $$ = new ast.Tuple($2, new ast.Loc(this._$)); }

     | 'if' expr 'then' expr 'else' expr { $$ = new ast.IfThenElse($2, $4, $6, new ast.Loc(this._$)); }
;

list_els : /* empty */ { $$ = [] }
         | f_list_els  { $$ = $1 }
;

f_list_els: expr                { $$ = [$1] }
          | expr ',' f_list_els { $$ = $3; $$.unshift($1); }
;

tuple_els: /* empty */ { $$ = {} }
         | f_tuple_els { $$ = $1 }
;

f_tuple_els: ID ':' expr                 { $$ = {}; $$[$1] = $3; }
           | ID ':' expr ',' f_tuple_els { $$ = $5; $$[$1] = $3; }
;

/*
     | expr '.' expr { SelectExpr $1 $3 }
     | expr '{' f_list_els '}' { ProjExpr $1 $3 }
     | '{' expr 'for' for_els 'when' expr '}' { GenExpr $2 $4 $6 }
     | '{' expr 'for' for_els '}' { GenExpr $2 $4 (BoolExpr True) }
     | expr '[' expr ']' { BGenExpr $1 $3 }
     | id '(' list_els ')' { CallExpr $1 $3 }




for_els: id 'in' expr { M.singleton $1 $3 }
       | id 'in' expr ',' for_els { M.insert $1 $3 $5 }
*/

%%

var ast = require("./ast");