"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const helpers_1 = require("./helpers");
const fs_1 = require("fs");
const baseHandlers_1 = __importDefault(require("./handlers/baseHandlers"));
const process_1 = __importDefault(require("process"));
const fs_2 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
if (require.main === module) {
    try {
        main();
    }
    catch (e) {
        console.log(e);
    }
}
function main() {
    const { projectPath, inputFilePath } = processCLIEnvironment(process_1.default);
    const project = new ts_morph_1.Project({
        compilerOptions: {
            target: ts_morph_1.ScriptTarget.ES2015,
        },
        tsConfigFilePath: projectPath + "/tsconfig.json",
    });
    project.addSourceFilesAtPaths("output_templates/*.template");
    let fileContent = (0, fs_1.readFileSync)(inputFilePath, { encoding: "utf-8" });
    const { content, startLine, endLine } = (0, helpers_1.findScriptContent)(fileContent);
    project.createSourceFile("./tmp.tscontent", content);
    const appNode = project.getSourceFile("./tmp.tscontent");
    const template = project.getSourceFile("output_templates/output_vue2_composition.template");
    const scriptContent = (0, baseHandlers_1.default)(appNode, template);
    console.log(' - writing output');
    const upContent = fileContent.split('\n').slice(0, startLine).join('\n');
    const lowContent = fileContent.split('\n').slice(endLine).join('\n');
    fileContent = upContent +
        '\n<script lang="ts">\n' +
        scriptContent + lowContent;
    (0, fs_1.writeFileSync)(inputFilePath, fileContent);
    // console.log(scriptContent);
}
function processCLIEnvironment(process) {
    const projectPath = process.cwd(), input = process.argv[2];
    if (!input || !input.length)
        throw "ERROR: No input file provided.";
    const inputFilePath = path_1.default.isAbsolute(input) ? input : path_1.default.resolve(input);
    if (!fs_2.default.existsSync(projectPath + "/tsconfig.json"))
        console.log(`/!\\ No tsconfig file found.`);
    if (!inputFilePath || !fs_2.default.existsSync(inputFilePath))
        throw `ERROR: File '${inputFilePath}' is not existing`;
    process.chdir(process.env.VUE_MIGA_HOME);
    return { projectPath, inputFilePath, };
}
//# sourceMappingURL=index.js.map