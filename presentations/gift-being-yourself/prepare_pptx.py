from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as ET
import re
root=Path(__file__).resolve().parent
build=root.parents[1]/'tmp'/'gift-build'
source=build/'draft.pptx'
target=build/'candidate.pptx'
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
count=0
with ZipFile(source) as z, ZipFile(target,'w',ZIP_DEFLATED) as out:
    for item in z.infolist():
        data=z.read(item.filename)
        if re.fullmatch(r'ppt/(slides/slide|notesSlides/notesSlide)\d+\.xml',item.filename):
            doc=ET.fromstring(data)
            for p in doc.findall('.//a:p',ns):
                text=''.join(p.itertext())
                ar=bool(re.search(r'[\u0600-\u06ff]',text))
                pp=p.find('a:pPr',ns)
                if pp is None:
                    pp=ET.Element('{'+ns['a']+'}pPr');p.insert(0,pp)
                pp.set('rtl','1' if ar else '0')
                if ar: pp.set('algn','r');count+=1
                for rp in p.findall('.//a:rPr',ns)+p.findall('.//a:defRPr',ns):
                    rp.set('lang','ar-EG' if ar else 'en-US')
            data=ET.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True)
        out.writestr(item,data)
print('Prepared candidate with',count,'Arabic RTL paragraphs')
