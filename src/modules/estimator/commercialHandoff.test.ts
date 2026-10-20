import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCommercialHandoff,
  consumeCommercialHandoff,
  stageCommercialHandoff,
} from "./commercialHandoff";

const user="10000000-0000-4000-8000-000000000005";
const product="10000000-0000-4000-8000-000000000001";
const library="10000000-0000-4000-8000-000000000002";
const version="10000000-0000-4000-8000-000000000003";
const fields=[
  {key:"width",id:"10000000-0000-4000-8000-000000000011",
   type:"DECIMAL",unit:"m",required:true,sortOrder:0,label:"Largura"},
  {key:"height",id:"10000000-0000-4000-8000-000000000012",
   type:"DECIMAL",unit:"m",required:true,sortOrder:1,label:"Altura"},
  {key:"thickness",id:"10000000-0000-4000-8000-000000000013",
   type:"SELECT",unit:null,required:true,sortOrder:2,label:"Espessura",
   options:[{value:"2",label:"2 mm"},{value:"10",label:"10 mm"}]},
  {key:"number_of_colors",id:"10000000-0000-4000-8000-000000000014",
   type:"DECIMAL",unit:null,required:true,sortOrder:3,label:"Cores",defaultValue:"0"},
];
const form:any={availableInstallments:[1,2],products:[{
  productId:product,productVersionId:version,productVersionNumber:3,
  code:"LETREIRO_PVC",name:"Letreiro em PVC Expandido",
  calculationAvailable:true,installationAvailable:false,munckAvailable:false,
  inputs:fields,
}]};
const checked:any={
  adapter:{productId:product,libraryProductId:library,commercialVersion:2,
    engineeringVersion:{id:version,number:3},
    fields:[{id:"medidas",unit:"cm"}]},
  eligibility:{status:"CALCULABLE",canAttemptCalculation:true,canTransfer:false,
    productId:product,libraryProductId:library,commercialVersion:2,
    engineeringVersion:{id:version,number:3}},
};
const values={medidas:{width:"150",height:"50"},quantidade:2,
  espessura:"10 mm",acabamento:"PVC natural branco",
  instalacao:"Não",arte_vetorial:"Sim"};

beforeEach(()=>clearCommercialHandoff());
describe("31F — one-time commercial-to-estimator handoff",()=>{
  it("prefills only compatible official form controls, without starting a calculation",()=>{
    stageCommercialHandoff(user,checked,values,[]);
    const out=consumeCommercialHandoff(user,form);
    expect(out).toMatchObject({attempted:true,prefill:{
      productVersionId:version,quantity:"2",
      units:{width:"cm",height:"cm"},
      values:{width:"150",height:"50",thickness:"10",number_of_colors:"0"},
    }});
    expect(consumeCommercialHandoff(user,form)).toEqual({prefill:null,attempted:false});
  });
  it("refuses session identity and version changes",()=>{
    stageCommercialHandoff(user,checked,values,[]);
    expect(consumeCommercialHandoff("10000000-0000-4000-8000-000000000006",form))
      .toEqual({prefill:null,attempted:true});
    stageCommercialHandoff(user,checked,values,[]);
    const changed={...form,products:[{...form.products[0],productVersionId:
      "10000000-0000-4000-8000-000000000004"}]};
    expect(consumeCommercialHandoff(user,changed)).toEqual({prefill:null,attempted:true});
  });
  it("refuses unavailable products or changed published thickness options",()=>{
    stageCommercialHandoff(user,checked,values,[]);
    const inactive={...form,products:[{...form.products[0],calculationAvailable:false}]};
    expect(consumeCommercialHandoff(user,inactive).prefill).toBeNull();
    stageCommercialHandoff(user,checked,values,[]);
    const mismatched={...form,products:[{...form.products[0],inputs:fields.map(x=>
      x.key==="thickness"?{...x,options:[{value:"5",label:"5 mm"}]}:x)}]};
    expect(consumeCommercialHandoff(user,mismatched).prefill).toBeNull();
  });
  it("blocks painting, installation, supplements, stale eligibility and invalid values",()=>{
    const invalid=[
      {...values,instalacao:"Sim"},
      {...values,acabamento:"Pintura completa personalizada"},
      {...values,medidas:{width:"0",height:"50"}},
      {...values,quantidade:1.5},
    ];
    for(const value of invalid){
      expect(()=>stageCommercialHandoff(user,checked,value,[])).toThrow();
      expect(consumeCommercialHandoff(user,form).prefill).toBeNull();
    }
    expect(()=>stageCommercialHandoff(user,checked,values,["instalacao_servico_pvc"])).toThrow();
    expect(()=>stageCommercialHandoff(user,{
      ...checked,eligibility:{...checked.eligibility,status:"PREPARATION_ONLY",
        canAttemptCalculation:false},
    },values,[])).toThrow();
  });
  it("supports published millimeter dimensions converted to estimator centimeters",()=>{
    const mm={...checked,adapter:{...checked.adapter,fields:[{id:"medidas",unit:"mm"}]}};
    stageCommercialHandoff(user,mm,{...values,medidas:{width:"1500",height:"500"}},[]);
    expect(consumeCommercialHandoff(user,form).prefill?.values)
      .toMatchObject({width:"150",height:"50",thickness:"10"});
  });
});
