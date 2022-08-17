import { CallExpression, ts, VariableDeclaration, VariableStatement } from "ts-morph";
import { BUILTIN_IDENTIFIERS, TRANSFORMED_IDENTIFIERS } from "../consts";
import { getBlockFunctionName } from "../helpers/common";
import { InputMapper, OutputMapper } from "../models/mapperModel";

const functionsInBlockScope = {};
export function isCallExpressionDefined(callExp: CallExpression, inputMapper: InputMapper, outputMapper: OutputMapper) {
    const callName = callExp.getExpression().print();
    const check = inputMapper.methodNames.includes(callName)
                // any function that defined in global source file scope
                || inputMapper.localFileFunctionNames.includes(callName)
                // any function that start with context
                || callName.startsWith('context.')
                // any function that have already been converted
                || TRANSFORMED_IDENTIFIERS.find((iden) => callName.startsWith(iden))
                // any function that is built-in in the browser
                || BUILTIN_IDENTIFIERS.find((iden) => callName.startsWith(iden))
                // check with newly imported identifiers
                || outputMapper.newCompositionImports.find((iden) => callName.startsWith(iden))
                // check with old imported identifiers
                || inputMapper.importedIdentifierNames.find((iden) => callName.startsWith(iden));
                
    if (check) return true;

    //check if callName is in other imports
    const oImports = outputMapper.otherImports;
    const keys = Object.keys(oImports)
    for (let key of keys) {
        if (oImports[key].defaultImport === callName) return true;
        if (oImports[key].namedImports?.has(callName)) return true;
    }

    //Check if the call name is in the block scope
    const parentBlocks = callExp.getAncestors().filter(a => a.isKind(ts.SyntaxKind.Block))
    for (let b of parentBlocks) {
        let blockParent = getBlockFunctionName(b);
        if (!blockParent)
            continue;
        const name = blockParent.getName();
        if (!name || name === 'setup')
            continue;
        
        //get all functions in block scope
        if (!functionsInBlockScope[name]){
            if (blockParent.isKind(ts.SyntaxKind.VariableDeclaration))
                blockParent = (blockParent as VariableDeclaration).getFirstChildByKind(ts.SyntaxKind.ArrowFunction)
            if (!blockParent || !blockParent.getBody)
                continue;
            // get function declared as functions
            functionsInBlockScope[name] = blockParent.getBody().getFunctions().map((f) => f.getName());

            //get function declared as arrow functions
            const varDeclares = blockParent.getBody().getChildrenOfKind(ts.SyntaxKind.VariableStatement)
                                    .map((v: VariableStatement) => v.getDeclarations()).flat();
            const arrowFunctionParents: VariableDeclaration[] = varDeclares.map(d => d.getInitializerIfKind(ts.SyntaxKind.ArrowFunction)?.getParent())
                                                                .filter(a => a);
            functionsInBlockScope[name] = functionsInBlockScope[name].concat(arrowFunctionParents.map(a => a.getName()));
        }
        if (functionsInBlockScope[name].includes(callName))
            return true
    }
}