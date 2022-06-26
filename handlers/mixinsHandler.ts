import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, ArrowFunction,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import {processThisKeywordAccess} from "../helpers";
import {InputMapper, OutputMapper} from "../models/mapperModel";

export function mixinsToComposables(inputMapper: InputMapper, outputMapper: OutputMapper) {
}