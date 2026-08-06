import{describe,expect,it}from"vitest";import{readFileSync,existsSync}from"node:fs";import{resolve}from"node:path";
const root=resolve(process.cwd());const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
describe("public release packaging",()=>{
 it("includes public community and installation files",()=>{for(const file of["LICENSE","CONTRIBUTING.md","SECURITY.md","CODE_OF_CONDUCT.md","CHANGELOG.md","docs/WINDOWS_INSTALL.md","docs/TROUBLESHOOTING.md","docs/ARCHITECTURE.md",".env.example",".github/workflows/ci.yml"])expect(existsSync(resolve(root,file)),file).toBe(true)});
 it("keeps the collection boundary disabled in the environment example and CI",()=>{expect(read(".env.example")).toContain("NEARBY_JOBS_ENABLE_COLLECTION_UI=0");const ci=read(".github/workflows/ci.yml");expect(ci).toContain('NEARBY_JOBS_ENABLE_COLLECTION_UI: "0"');expect(ci).not.toMatch(/collect:(?:jobkorea|albamon)|transport:jobkorea/)});
 it("pins read-only workflow permissions and has no deployment",()=>{const ci=read(".github/workflows/ci.yml");expect(ci).toContain("contents: read");expect(ci).not.toMatch(/\bdeploy\b|\bpublish\b|actions\/upload-release|softprops/i)});
 it("documents source limitations without claiming permission",()=>{const readme=read("README.md");expect(readme).toContain("permission is `unverified`");expect(readme).toContain("manual only");expect(readme).toContain("Albamon listing adapter");expect(readme).toContain("does not grant permission")});
});
