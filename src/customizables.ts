import { CallExpression, Node, StringLiteral, ts } from "ts-morph";
import { addImportToMapper, initDeclareInSetup } from "./helpers/common";
import { InputMapper, OutputMapper } from "./models/mapperModel";

export function customizedThisKeywordAccessProccessor(thisAccessKey: string, parentNode: Node, inputMapper: InputMapper, outputMapper?: OutputMapper){
    switch (thisAccessKey){
        case '$lang':
            parentNode.replaceWithText(`lang`);
            outputMapper && addImportToMapper(outputMapper, `@/lang/lang`, {defaultImport: `lang`})
            break;
        case '$router':
            parentNode.replaceWithText(`vRouter`);
            initDeclareInSetup(outputMapper, 'vRouter', 'useRouter()')
            outputMapper && addImportToMapper(outputMapper, `@/composables/root`, {namedImportsArray: [`useRouter`]})
            break;
        case '$emit':
            const emitEvent = (parentNode.getParent() as CallExpression).getArguments()[0] as StringLiteral;
            parentNode.replaceWithText(`context.emit`);
            inputMapper.emitsNames.add(emitEvent.getLiteralText ? emitEvent.getLiteralText() : emitEvent.getText());
            break;
        case '$refs':
            let nodeAccessCount = parentNode.getChildCount();
            if (nodeAccessCount < 4){
                //only this.$refs
                outputMapper.unsureExpression.push(parentNode);
                return;
            }
            const refAccessNode = parentNode.getParent().getChildAtIndex(2) as StringLiteral;
            const refAccess: string = refAccessNode.getLiteralText ? refAccessNode.getLiteralText() : refAccessNode.getText();
            inputMapper.refsNames.add(refAccess);
            parentNode.getParent().replaceWithText(`(${refAccess}.value as HTMLElement)`)
            break;
        default:
            //the accessing key is not data of component, could also be the argument of the function;
            parentNode.replaceWithText(thisAccessKey);
    }
}